import { Duration, Effect, Layer, Schema } from 'effect'
import { Dom } from 'foldkit'
import { load, pushUrl, replaceUrl } from 'foldkit/navigation'

import { makeCommand } from './definition'
import { searchDomains } from './domain'
import { Message } from './message'
import { searchRouter } from './route'

const SEARCH_DELAY_MILLISECONDS = 450

export const FetchDomains = makeCommand('FetchDomains', {
  args: { label: Schema.String, searchGeneration: Schema.Number },
  messages: [Message.SucceededFetchDomains, Message.FailedFetchDomains],
  interrupt: true,
  handler: function* () {
    return ({ label, searchGeneration }) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(SEARCH_DELAY_MILLISECONDS))
        const domains = yield* Effect.try(() => searchDomains(label))
        return Message.SucceededFetchDomains({
          searchGeneration,
          domains,
        })
      }).pipe(
        Effect.catch(() =>
          Effect.succeed(
            Message.FailedFetchDomains({
              searchGeneration,
              error: 'Could not search domains. Please try again.',
            }),
          ),
        ),
      )
  },
})

export const ReplaceSearchUrl = makeCommand('ReplaceSearchUrl', {
  args: { q: Schema.Option(Schema.String) },
  messages: [Message.CompletedReplaceSearchUrl],
  handler: function* () {
    return fields =>
      Effect.gen(function* () {
        yield* replaceUrl(searchRouter(fields))

        return Message.CompletedReplaceSearchUrl()
      })
  },
})

export const cancelSearch = () =>
  FetchDomains.Interrupt(() => Message.CompletedCancelSearch())

export const NavigateInternal = makeCommand('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  handler: function* () {
    return ({ url }) =>
      pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal()))
  },
})

export const LoadExternal = makeCommand('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  handler: function* () {
    return ({ href }) =>
      load(href).pipe(Effect.as(Message.CompletedLoadExternal()))
  },
})

export const FocusSearchInput = makeCommand('FocusSearchInput', {
  messages: [Message.CompletedFocusSearchInput],
  handler: function* () {
    return () =>
      Dom.focus('#domain-search', { preventScroll: true }).pipe(
        Effect.ignore,
        Effect.as(Message.CompletedFocusSearchInput()),
      )
  },
})

export const ReleaseEarlySearchListeners = makeCommand(
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
  ReleaseEarlySearchListeners.layer,
)
