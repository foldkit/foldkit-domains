import {
  Array,
  Clock,
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Ref,
  Schema,
} from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  Domain,
  DomainName,
  DomainQuote,
  domainNames,
  domainTlds,
} from '../shared/domain'
import { registrarResponseToRetryAfterSeconds } from './retryAfter'

const REGISTRAR_SEARCH_URL =
  'https://api.vercel.com/v1/registrar/domains/search'
const REGISTRAR_BATCH_SIZE = 200
const SEARCH_BATCH_CONCURRENCY = 2
const REGISTRAR_TIMEOUT = '15 seconds'

const RegistrarResult = Schema.Union([
  Schema.Struct({ domain: Schema.String, available: Schema.Literal(false) }),
  Schema.Struct({
    domain: Schema.String,
    available: Schema.Literal(true),
    price: DomainQuote.fields.price,
    renewalPrice: DomainQuote.fields.renewalPrice,
    years: DomainQuote.fields.years,
    premium: Schema.Boolean,
  }),
])
const RegistrarResponse = Schema.Struct({
  results: Schema.Array(RegistrarResult),
})

export const RegistrarError = defineTaggedUnion({
  RateLimited: {
    retryAfterSeconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  },
  AdmissionLimited: {
    source: Schema.Literals(['Client', 'Application']),
    retryAfterSeconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  },
  Unavailable: {},
})
export type RegistrarError = typeof RegistrarError.Type

export class Registrar extends Context.Service<
  Registrar,
  {
    readonly search: (
      label: string,
      offset?: number,
      limit?: number,
    ) => Effect.Effect<ReadonlyArray<Domain>, RegistrarError>
  }
>()('domains/Registrar') {}

export type RegistrarBatch = Effect.Effect<
  ReadonlyArray<Domain>,
  RegistrarError
>

export class RegistrarAdmission extends Context.Service<
  RegistrarAdmission,
  { readonly run: (batch: RegistrarBatch) => RegistrarBatch }
>()('domains/RegistrarAdmission') {}

export const RegistrarLayer = Layer.effect(
  Registrar,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const maybeAdmission = yield* Effect.serviceOption(RegistrarAdmission)
    const maybeAccessToken = yield* Config.Redacted('VERCEL_API_TOKEN').pipe(
      Config.option,
      Effect.orDie,
    )
    const cooldownRef = yield* Ref.make<Option.Option<number>>(Option.none())

    const ensureProviderReady = Effect.gen(function* () {
      const nowMillis = yield* Clock.currentTimeMillis
      const maybeDeadline = yield* Ref.get(cooldownRef)

      if (Option.isSome(maybeDeadline) && maybeDeadline.value > nowMillis) {
        return yield* Effect.fail(
          RegistrarError.RateLimited({
            retryAfterSeconds: Math.ceil(
              Duration.toSeconds(
                Duration.millis(maybeDeadline.value - nowMillis),
              ),
            ),
          }),
        )
      }
    })

    const searchBatch = (candidates: ReadonlyArray<DomainName>) =>
      Effect.gen(function* () {
        yield* ensureProviderReady

        const names = Array.map(candidates, domain => domain.name)
        const request = yield* HttpClientRequest.post(
          REGISTRAR_SEARCH_URL,
        ).pipe(HttpClientRequest.bodyJson({ domains: names }))

        const authenticatedRequest = Option.match(maybeAccessToken, {
          onNone: () => request,
          onSome: accessToken =>
            HttpClientRequest.bearerToken(request, accessToken),
        })
        const response = yield* client.execute(authenticatedRequest)

        if (response.status === 429) {
          const nowMillis = yield* Clock.currentTimeMillis

          const body = yield* response.json.pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          )

          const retryAfterSeconds = registrarResponseToRetryAfterSeconds(
            response.headers,
            body,
            nowMillis,
          )

          const nextDeadline =
            nowMillis + Duration.toMillis(Duration.seconds(retryAfterSeconds))

          yield* Ref.update(
            cooldownRef,
            Option.match({
              onNone: () => Option.some(nextDeadline),
              onSome: deadline => Option.some(Math.max(deadline, nextDeadline)),
            }),
          )

          return yield* Effect.fail(
            RegistrarError.RateLimited({ retryAfterSeconds }),
          )
        }

        yield* HttpClientResponse.filterStatusOk(response)

        const data =
          yield* HttpClientResponse.schemaBodyJson(RegistrarResponse)(response)

        const hasExactResults =
          data.results.length === names.length &&
          Array.every(data.results, (result, index) =>
            Array.get(names, index).pipe(Option.contains(result.domain)),
          )

        if (!hasExactResults) {
          return yield* Effect.fail(RegistrarError.Unavailable())
        }

        return Array.zipWith(candidates, data.results, (name, result) => {
          if (result.available) {
            return Domain.Available({
              ...name,
              price: result.price,
              renewalPrice: result.renewalPrice,
              years: result.years,
              isPremium: result.premium,
            })
          } else {
            return Domain.Unconfirmed(name)
          }
        })
      }).pipe(
        Effect.catch(error =>
          Effect.fail(
            Schema.is(RegistrarError)(error)
              ? error
              : RegistrarError.Unavailable(),
          ),
        ),
      )

    return {
      search: (label: string, offset = 0, limit = domainTlds.length) =>
        Effect.forEach(
          Array.chunksOf(
            Array.take(Array.drop(domainNames(label), offset), limit),
            REGISTRAR_BATCH_SIZE,
          ),
          candidates => {
            const batch = searchBatch(candidates)
            return Option.match(maybeAdmission, {
              onNone: () => batch,
              onSome: admission => admission.run(batch),
            })
          },
          { concurrency: SEARCH_BATCH_CONCURRENCY },
        ).pipe(
          Effect.map(Array.flatten),
          Effect.timeout(REGISTRAR_TIMEOUT),
          Effect.catchTag('TimeoutError', () =>
            Effect.logWarning('Registrar search exceeded its deadline', {
              offset,
              limit,
            }).pipe(Effect.andThen(Effect.fail(RegistrarError.Unavailable()))),
          ),
        ),
    }
  }),
)
