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
import { SearchMode } from '../../shared/searchMode'
import {
  DismissSearchKeyboard,
  FocusSearchInput,
  ReplaceSearchUrl,
} from '../command'
import { DomainsQueryBinding } from '../composition'
import { DomainsQuery, DomainsQueryFailure } from '../domainsQuery'
import { Message } from '../message'
import {
  emptyModel as defaultModel,
  urlOrThrow,
  withDomainsForRange,
} from '../model.fixture'
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
  domainsRequestKey,
  makeDomainsFetch,
  resolveDomainsCancellation,
  resolveDomainsFailure,
  resolveDomainsSuccess,
  resolveResultsListScrolls,
  resolveSearchTime,
} from './test'

const emptyModel = modifyFields(defaultModel, { searchMode: () => 'Live' })

const cooldown = SearchCooldown.make({
  source: 'Registrar',
  expiresAtMillis: 10_000,
})
const maybeCooldown = Option.some(cooldown)
const cooldownFailure = DomainsQueryFailure.make({
  error: 'The domain provider is busy. Please try again in 10 seconds.',
  maybeSearchCooldown: maybeCooldown,
})

test('a canceled completion stays silent before the route event, while the current completion installs its cooldown', () => {
  const acmeArgs = {
    mode: SearchMode.make('Live'),
    label: 'acme',
    offset: 0,
    limit: 4,
  }
  const otherArgs = {
    mode: SearchMode.make('Live'),
    label: 'other',
    offset: 0,
    limit: 4,
  }

  story(
    update,
    given(emptyModel),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    resolveSearchTime(1, 0),
    Command.expectHas(makeDomainsFetch(acmeArgs, 1)),
    message(Message.UpdatedSearch({ value: 'other' })),
    resolveDomainsCancellation(acmeArgs, 1),
    message(
      toParentMessage(
        DomainsQueryBinding,
        DomainsQuery.Message.CompletedFetch({
          args: acmeArgs,
          generation: 1,
          requestKey: domainsRequestKey(acmeArgs),
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
    Command.expectHas(makeDomainsFetch(otherArgs, 3)),
    resolveDomainsFailure(otherArgs, 3, cooldownFailure, 220),
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
  const args = {
    mode: SearchMode.make('Live'),
    label: 'acme',
    offset: 0,
    limit: 4,
  }
  const domains = Array.take(makeDomainFixtures('acme'), 4)
  const cachedModel = modifyFields(
    withDomainsForRange(
      modifyFields(emptyModel, {
        route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
        searchGeneration: () => 1,
      }),
      args,
      domains,
    ),
    {
      route: () => ApplicationRoute.Search({ q: Option.some('other') }),
      domainCandidateRanges: () => [],
      maybeSearchCooldown: () => maybeCooldown,
    },
  )

  story(
    update,
    given(modifyFields(cachedModel, { tldFilter: () => 'Com' })),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    resolveSearchTime(2, 100),
    model(model => {
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({ domains }),
      )
      expect(model.maybeBlockedDomainCandidateRange).toEqual(Option.none())
    }),
    message(Message.SubmittedSearch()),
    Command.resolve(
      DismissSearchKeyboard,
      Message.CompletedDismissSearchKeyboard(),
    ),
    resolveSearchTime(3, 200, 0, 4, true),
    model(model => {
      expect(model.maybeBlockedDomainCandidateRange).toEqual(
        Option.some({ offset: 0, limit: 4 }),
      )
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({
          domains,
          quoteRequest: QuoteRequestPresentation.Failed({
            offset: 0,
            limit: 4,
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
    resolveSearchTime(3, 10_000, 0, 4, true),
    Command.expectHas(makeDomainsFetch(args, 2)),
    resolveDomainsSuccess(args, 2, domains, 10_020),
    model(model => {
      expect(model.maybeSearchCooldown).toEqual(Option.none())
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({ domains }),
      )
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})
