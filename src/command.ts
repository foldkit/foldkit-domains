import {
  Clock,
  Duration,
  Effect,
  Layer,
  Match,
  Option,
  Ref,
  Schema,
} from 'effect'
import { Dom } from 'foldkit'
import { load, pushUrl, replaceUrl } from 'foldkit/navigation'

import { ApplicationDefinition } from './definition'
import { QueryWindow } from './domain'
import { RateLimitSource, SearchError } from './domainsRpc'
import { Message } from './message'
import { PageScrollKey } from './resultsList'
import { searchRouter } from './route'
import { DomainsClient } from './rpc'
import { SEARCH_INPUT_SELECTOR, searchInputConfig } from './searchInput'

const SEARCH_DEBOUNCE_MILLISECONDS = 350
const SEARCH_TIMEOUT = '20 seconds'
const SearchCooldown = Schema.Struct({
  source: RateLimitSource,
  deadlineMillis: Schema.Number,
})

export const FetchDomains = ApplicationDefinition.makeCommand('FetchDomains', {
  args: {
    label: Schema.String,
    searchGeneration: Schema.Number,
    offset: QueryWindow.fields.offset,
    limit: QueryWindow.fields.limit,
  },
  messages: [Message.SucceededFetchDomains, Message.FailedFetchDomains],
  interrupt: true,
  handler: function* () {
    const client = yield* DomainsClient
    const cooldown = yield* Ref.make<Option.Option<typeof SearchCooldown.Type>>(
      Option.none(),
    )

    return ({ label, searchGeneration, offset, limit }) => {
      const failSearch = () =>
        Effect.succeed(
          Message.FailedFetchDomains({
            searchGeneration,
            error: 'Could not search domains. Please try again.',
          }),
        )

      return Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(SEARCH_DEBOUNCE_MILLISECONDS))
        const nowMillis = yield* Clock.currentTimeMillis
        const maybeCooldown = yield* Ref.get(cooldown)

        if (
          Option.isSome(maybeCooldown) &&
          maybeCooldown.value.deadlineMillis > nowMillis
        ) {
          return yield* Effect.fail(
            SearchError.RateLimited({
              source: maybeCooldown.value.source,
              retryAfterSeconds: Math.ceil(
                Duration.toSeconds(
                  Duration.millis(
                    maybeCooldown.value.deadlineMillis - nowMillis,
                  ),
                ),
              ),
            }),
          )
        }

        const domains = yield* client
          .SearchDomains({ label, offset, limit })
          .pipe(
            Effect.tapError(error => {
              if (error._tag === 'RateLimited') {
                return Effect.gen(function* () {
                  const nowMillis = yield* Clock.currentTimeMillis
                  yield* Ref.set(
                    cooldown,
                    Option.some(
                      SearchCooldown.make({
                        source: error.source,
                        deadlineMillis:
                          nowMillis +
                          Duration.toMillis(
                            Duration.seconds(error.retryAfterSeconds),
                          ),
                      }),
                    ),
                  )
                })
              } else {
                return Effect.void
              }
            }),
          )

        return Message.SucceededFetchDomains({
          searchGeneration,
          domains,
        })
      }).pipe(
        Effect.timeout(SEARCH_TIMEOUT),
        Effect.catchTags({
          RateLimited: ({ source, retryAfterSeconds }) => {
            const unit = retryAfterSeconds === 1 ? 'second' : 'seconds'
            const description = Match.value(source).pipe(
              Match.when('Client', () => 'Too many searches.'),
              Match.when('Application', () => 'Search is busy.'),
              Match.when('Registrar', () => 'The domain provider is busy.'),
              Match.exhaustive,
            )

            return Effect.succeed(
              Message.FailedFetchDomains({
                searchGeneration,
                error: `${description} Please try again in ${retryAfterSeconds} ${unit}.`,
              }),
            )
          },
          Unavailable: () =>
            Effect.succeed(
              Message.FailedFetchDomains({
                searchGeneration,
                error:
                  'Could not check availability and prices. Please try again.',
              }),
            ),
        }),
        Effect.catch(failSearch),
        Effect.catchDefect(failSearch),
      )
    }
  },
})

export const ReplaceSearchUrl = ApplicationDefinition.makeCommand(
  'ReplaceSearchUrl',
  {
    args: { q: Schema.Option(Schema.String) },
    messages: [Message.CompletedReplaceSearchUrl],
    handler: function* () {
      return fields =>
        Effect.gen(function* () {
          yield* replaceUrl(searchRouter(fields))

          return Message.CompletedReplaceSearchUrl()
        })
    },
  },
)

export const cancelSearch = () =>
  FetchDomains.Interrupt(() => Message.CompletedCancelSearch())

export const NavigateInternal = ApplicationDefinition.makeCommand(
  'NavigateInternal',
  {
    args: { url: Schema.String },
    messages: [Message.CompletedNavigateInternal],
    handler: function* () {
      return ({ url }) =>
        pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal()))
    },
  },
)

export const LoadExternal = ApplicationDefinition.makeCommand('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  handler: function* () {
    return ({ href }) =>
      load(href).pipe(Effect.as(Message.CompletedLoadExternal()))
  },
})

export const FocusSearchInput = ApplicationDefinition.makeCommand(
  'FocusSearchInput',
  {
    messages: [Message.CompletedFocusSearchInput],
    handler: function* () {
      return () =>
        Dom.focus(SEARCH_INPUT_SELECTOR, { preventScroll: true }).pipe(
          Effect.ignore,
          Effect.as(Message.CompletedFocusSearchInput()),
        )
    },
  },
)

export const FocusCartButton = ApplicationDefinition.makeCommand(
  'FocusCartButton',
  {
    messages: [Message.CompletedFocusCartButton],
    handler: function* () {
      return () =>
        Dom.focus('#cart-button', { preventScroll: true }).pipe(
          Effect.ignore,
          Effect.as(Message.CompletedFocusCartButton()),
        )
    },
  },
)

export const FocusCartCloseButton = ApplicationDefinition.makeCommand(
  'FocusCartCloseButton',
  {
    messages: [Message.CompletedFocusCartCloseButton],
    handler: function* () {
      return () =>
        Dom.focus('.cart-heading button', { preventScroll: true }).pipe(
          Effect.ignore,
          Effect.as(Message.CompletedFocusCartCloseButton()),
        )
    },
  },
)

const KEYBOARD_SCROLL_DISTANCE_PX = 40
const PAGE_SCROLL_FRACTION = 0.9

export const ScrollPage = ApplicationDefinition.makeCommand('ScrollPage', {
  args: { key: PageScrollKey },
  messages: [Message.CompletedScrollPage],
  handler: function* () {
    return ({ key }) =>
      Effect.sync(() => {
        const pageDistance = window.innerHeight * PAGE_SCROLL_FRACTION
        const top = Match.value(key).pipe(
          Match.when(
            'ArrowUp',
            () => window.scrollY - KEYBOARD_SCROLL_DISTANCE_PX,
          ),
          Match.when(
            'ArrowDown',
            () => window.scrollY + KEYBOARD_SCROLL_DISTANCE_PX,
          ),
          Match.when('PageUp', () => window.scrollY - pageDistance),
          Match.when('PageDown', () => window.scrollY + pageDistance),
          Match.when('Home', () => 0),
          Match.exhaustive,
        )
        window.scrollTo({ top, behavior: 'instant' })
      }).pipe(Effect.as(Message.CompletedScrollPage()))
  },
})

export const DismissSearchKeyboard = ApplicationDefinition.makeCommand(
  'DismissSearchKeyboard',
  {
    messages: [Message.CompletedDismissSearchKeyboard],
    handler: function* () {
      return () =>
        Effect.sync(() => {
          const input = document.getElementById(searchInputConfig.id)

          if (
            window.matchMedia(searchInputConfig.touchMediaQuery).matches &&
            input instanceof HTMLInputElement
          ) {
            input.blur()
          }
        }).pipe(Effect.as(Message.CompletedDismissSearchKeyboard()))
    },
  },
)

export const ReleaseEarlySearchListeners = ApplicationDefinition.makeCommand(
  'ReleaseEarlySearchListeners',
  {
    messages: [Message.CompletedReleaseEarlySearchListeners],
    handler: function* () {
      return () =>
        Effect.sync(() =>
          document.dispatchEvent(new Event('domains:ready')),
        ).pipe(Effect.as(Message.CompletedReleaseEarlySearchListeners()))
    },
  },
)

export const EffectsLayer = Layer.mergeAll(
  FetchDomains.layer,
  ReplaceSearchUrl.layer,
  NavigateInternal.layer,
  LoadExternal.layer,
  FocusSearchInput.layer,
  FocusCartButton.layer,
  FocusCartCloseButton.layer,
  ScrollPage.layer,
  DismissSearchKeyboard.layer,
  ReleaseEarlySearchListeners.layer,
)
