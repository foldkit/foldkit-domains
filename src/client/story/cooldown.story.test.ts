import { Array, Option, Result } from 'effect'
import {
  Command,
  Subscription,
  given,
  message,
  model,
  story,
} from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { toParentMessage } from 'foldkit/test'
import { expect, test } from 'vitest'

import { makeDomainFixtures } from '../../shared/domain.fixture'
import {
  DismissSearchKeyboard,
  FocusSearchInput,
  ReplaceSearchUrl,
} from '../command'
import { QuoteWindowsBinding } from '../composition'
import { Message } from '../message'
import { emptyModel, urlOrThrow, withQuotedWindow } from '../model.fixture'
import { QuoteFailure, QuoteWindows } from '../quoteWindows'
import { ApplicationRoute } from '../route'
import { SearchCooldown } from '../searchCooldown'
import {
  QuoteRequestPresentation,
  SearchPresentation,
  searchPresentation,
} from '../searchPresentation'
import { subscriptions } from '../subscription'
import { update } from '../update'
import {
  quoteFetch,
  quoteRequestKey,
  resolveQuoteCancellation,
  resolveQuoteFailure,
  resolveQuoteSuccess,
  resolveResultsListScrolls,
  resolveSearchTime,
} from './test'

const cooldown = SearchCooldown.make({
  source: 'Registrar',
  expiresAtMillis: 10_000,
})
const maybeCooldown = Option.some(cooldown)
const cooldownFailure = QuoteFailure.make({
  error: 'The domain provider is busy. Please try again in 10 seconds.',
  maybeSearchCooldown: maybeCooldown,
})

test('a canceled completion stays silent before the route event, while the current completion installs its cooldown', () => {
  const acmeArgs = { label: 'acme', offset: 0, limit: 60 }
  const otherArgs = { label: 'other', offset: 0, limit: 60 }

  story(
    update,
    given(emptyModel),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    resolveSearchTime(1, 0),
    Command.expectHas(quoteFetch(acmeArgs, 1)),
    message(Message.UpdatedSearch({ value: 'other' })),
    resolveQuoteCancellation(acmeArgs, 1),
    message(
      toParentMessage(
        QuoteWindowsBinding,
        QuoteWindows.Message.CompletedFetch({
          args: acmeArgs,
          generation: 1,
          requestKey: quoteRequestKey(acmeArgs),
          result: Result.fail(cooldownFailure),
          completedAtMillis: 100,
        }),
      ),
    ),
    model(model => {
      expect(model.route).toEqual(
        ApplicationRoute.Search({ q: Option.some('acme') }),
      )
      expect(model.maybeSearchCooldown).toEqual(Option.none())
    }),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.some('other') }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=other') }),
    ),
    resolveSearchTime(3, 200),
    Command.expectHas(quoteFetch(otherArgs, 3)),
    resolveQuoteFailure(otherArgs, 3, cooldownFailure, 220),
    model(model => {
      expect(model.maybeSearchCooldown).toEqual(maybeCooldown)
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Failed({ error: cooldownFailure.error }),
      )
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('fresh navigation passes cooldown preflight, forced refresh waits for the exact deadline', () => {
  const args = { label: 'acme', offset: 0, limit: 60 }
  const quotes = Array.take(makeDomainFixtures('acme'), 60)
  const cachedModel = modifyFields(
    withQuotedWindow(
      modifyFields(emptyModel, {
        route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
        searchGeneration: () => 1,
      }),
      args,
      quotes,
    ),
    {
      route: () => ApplicationRoute.Search({ q: Option.some('other') }),
      quotePlan: () => [],
      maybeSearchCooldown: () => maybeCooldown,
    },
  )

  story(
    update,
    given(cachedModel),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    resolveSearchTime(2, 100),
    model(model => {
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({ domains: quotes }),
      )
      expect(model.maybeBlockedQuoteWindow).toEqual(Option.none())
    }),
    message(Message.SubmittedSearch()),
    Command.resolve(
      DismissSearchKeyboard,
      Message.CompletedDismissSearchKeyboard(),
    ),
    resolveSearchTime(3, 200, 0, 60, true),
    model(model => {
      expect(model.maybeBlockedQuoteWindow).toEqual(
        Option.some({ offset: 0, limit: 60 }),
      )
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({
          domains: quotes,
          quoteRequest: QuoteRequestPresentation.Failed({
            offset: 0,
            limit: 60,
            error:
              'The domain provider is busy. Please try again in 10 seconds.',
          }),
        }),
      )
    }),
    Subscription.from(subscriptions).emit(
      subscriptions.searchCooldownExpiry,
      Message.ReachedSearchCooldownExpiry({ nowMillis: 9999 }),
    ),
    model(model => {
      expect(model.maybeSearchCooldown).toEqual(maybeCooldown)
    }),
    Subscription.from(subscriptions).emit(
      subscriptions.searchCooldownExpiry,
      Message.ReachedSearchCooldownExpiry({ nowMillis: 10_000 }),
    ),
    message(Message.ClickedRetrySearch()),
    Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
    resolveSearchTime(3, 10_000, 0, 60, true),
    Command.expectHas(quoteFetch(args, 2)),
    resolveQuoteSuccess(args, 2, quotes, 10_020),
    model(model => {
      expect(model.maybeSearchCooldown).toEqual(Option.none())
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({ domains: quotes }),
      )
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})
