import { Duration, Effect, Layer, Schema } from 'effect'
import { load, pushUrl, replaceUrl } from 'foldkit/navigation'

import { ApplicationDefinition } from './definition'
import { searchDomains } from './domain'
import { Message } from './message'

const SEARCH_DELAY_MILLISECONDS = 450

export const FetchDomains = ApplicationDefinition.makeCommand('FetchDomains', {
  args: { label: Schema.String, revision: Schema.Number },
  messages: [Message.SucceededFetchDomains, Message.FailedFetchDomains],
  interrupt: true,
  handler: function* () {
    return ({ label, revision }) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(SEARCH_DELAY_MILLISECONDS))
        const domains = yield* Effect.try(() => searchDomains(label))
        return Message.SucceededFetchDomains({
          revision,
          domains,
        })
      }).pipe(
        Effect.catch(() =>
          Effect.succeed(
            Message.FailedFetchDomains({
              revision,
              error: 'Could not search domains. Please try again.',
            }),
          ),
        ),
      )
  },
})

export const SyncSearchUrl = ApplicationDefinition.makeCommand(
  'SyncSearchUrl',
  {
    args: { query: Schema.String },
    messages: [Message.CompletedSyncSearchUrl],
    handler: function* () {
      return ({ query }) =>
        Effect.gen(function* () {
          const url = new URL(window.location.href)

          if (query) {
            url.searchParams.set('q', query)
          } else {
            url.searchParams.delete('q')
          }

          yield* replaceUrl(`${url.pathname}${url.search}${url.hash}`)

          return Message.CompletedSyncSearchUrl()
        })
    },
  },
)

export const Navigate = ApplicationDefinition.makeCommand('Navigate', {
  args: { href: Schema.String, isExternal: Schema.Boolean },
  messages: [Message.CompletedNavigate],
  handler: function* () {
    return ({ href, isExternal }) =>
      (isExternal ? load(href) : pushUrl(href)).pipe(
        Effect.as(Message.CompletedNavigate()),
      )
  },
})

export const FocusSearch = ApplicationDefinition.makeCommand('FocusSearch', {
  messages: [Message.CompletedFocusSearch],
  handler: function* () {
    return () =>
      Effect.sync(() =>
        document
          .getElementById('domain-search')
          ?.focus({ preventScroll: true }),
      ).pipe(Effect.as(Message.CompletedFocusSearch()))
  },
})

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
  SyncSearchUrl.layer,
  Navigate.layer,
  FocusSearch.layer,
  ReleaseEarlySearchListeners.layer,
)
