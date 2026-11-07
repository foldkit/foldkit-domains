import { Array, Effect, Option, Result } from 'effect'
import { Story, Url } from 'foldkit'
import { Query } from 'foldkit/experimental'
import { modifyFields } from 'foldkit/struct'

import { Domain, domainTlds, queryToMaybeDomainLabel } from '../shared/domain'
import { makeDomainFixtures } from '../shared/domain.fixture'
import { ApplicationBlock } from './block'
import { DomainsQuery, DomainsQueryArgs } from './domainsQuery'
import { layer } from './layer'
import { Model } from './model'
import { ApplicationRoute } from './route'

export const emptyModel = Story.withBlock(
  { block: ApplicationBlock, layer },
  application =>
    modifyFields(application.init(urlOrThrow('http://localhost/')).model, {
      searchGeneration: () => 0,
    }),
)

export const domainsRequestKey = ({ label, limit, offset }: DomainsQueryArgs) =>
  JSON.stringify({ label, limit, offset })

export const withDomainsForRange = (
  model: Model,
  args: DomainsQueryArgs,
  domains: ReadonlyArray<Domain>,
  completedAtMillis = 0,
) =>
  Effect.gen(function* () {
    const generation = model.domainsQuery.generation + 1
    const domainsQuery = yield* Story.story(
      { block: DomainsQuery, layer: Query.layer },
      Story.given(model.domainsQuery),
      Story.message(DomainsQuery.Message.RequestedRevalidationOrLoad({ args })),
      Story.Command.resolve(
        DomainsQuery.Fetch,
        DomainsQuery.Message.CompletedFetch({
          args,
          generation,
          requestKey: domainsRequestKey(args),
          result: Result.succeed(domains),
          completedAtMillis,
        }),
      ),
    )

    return modifyFields(model, {
      domainsQuery: () => domainsQuery,
      selectedDomainRanges: ranges =>
        Array.some(
          ranges,
          range => range.offset === args.offset && range.limit === args.limit,
        )
          ? ranges
          : Array.append(ranges, { offset: args.offset, limit: args.limit }),
    })
  })

export const readyModel = (query: string) =>
  Effect.gen(function* () {
    const initialModel = yield* emptyModel
    const label = Option.getOrThrow(queryToMaybeDomainLabel(query))

    return yield* withDomainsForRange(
      modifyFields(initialModel, {
        route: () => ApplicationRoute.Search({ q: Option.some(query) }),
        searchGeneration: () => 1,
        searchLayout: () => 'Search',
      }),
      { label, offset: 0, limit: domainTlds.length },
      makeDomainFixtures(label),
    )
  })

export const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(
    Url.fromString(raw),
    () => new Error(`Failed to parse URL: ${raw}`),
  )
