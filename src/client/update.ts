import { Array, Match, Option } from 'effect'
import { Update, Url } from 'foldkit'
import { UrlRequest } from 'foldkit/navigation'

import { Domain } from '../shared/domain'
import {
  DismissSearchKeyboard,
  FocusCartCloseButton,
  FocusSearchInput,
  LoadExternal,
  NavigateInternal,
  RevealResultsListStart,
  ScrollPage,
} from './command'
import {
  ApplicationComposition,
  CartDialogBinding,
  FiltersDialogBinding,
  ResultsListBinding,
} from './composition'
import {
  makeCommandsStep,
  makeFieldsStep,
  makeNoopStep,
  makeStep,
} from './definition'
import { Message } from './message'
import { routeToQuery, urlToApplicationRoute } from './route'
import {
  clearSearchStep,
  informResultsListStep,
  loadRequiredQuotesStep,
  makeChangeSearchQueryStep,
  makeRequestQuoteWindowStep,
  makeSearchQueryStep,
  retrySearchStep,
  searchQueryStep,
  startQuoteWindowStep,
} from './steps/index'

export const update = ApplicationComposition.makeUpdate({
  UpdatedSearch: (model, { value }) => makeChangeSearchQueryStep(value)(model),

  RequestedSearch: searchQueryStep,

  ReachedSearchCooldownExpiry: makeFieldsStep.fromMessage(({ nowMillis }) => ({
    maybeSearchCooldown: Option.filter(
      cooldown => cooldown.expiresAtMillis > nowMillis,
    ),
  })),

  RequestedQuotes: makeStep.fromMessage(({ offset, limit }) =>
    makeRequestQuoteWindowStep({ offset, limit }),
  ),

  SubmittedSearch: Update.combineSteps([
    makeSearchQueryStep(true),
    makeCommandsStep(() => [DismissSearchKeyboard()]),
  ]),

  ClickedRetrySearch: Update.combineSteps([
    retrySearchStep,
    makeCommandsStep(() => [FocusSearchInput()]),
  ]),

  PressedEscape: clearSearchStep,

  FocusedResultsList: makeCommandsStep(() => [RevealResultsListStart()]),

  PressedResultsListScrollKey: makeStep.fromMessage(({ key }) =>
    Match.value(key).pipe(
      Match.when('End', () => ResultsListBinding.requestScrollToEnd()),
      Match.orElse(key => makeCommandsStep(() => [ScrollPage({ key })])),
    ),
  ),

  ClickedClearSearch: Update.combineSteps([
    clearSearchStep,
    makeCommandsStep(() => [FocusSearchInput()]),
  ]),

  ChangedUrl: makeStep((model, { url }: typeof Message.ChangedUrl.Type) => {
    const nextRoute = urlToApplicationRoute(url)

    const isSearchRefreshNeeded =
      routeToQuery(nextRoute) !== routeToQuery(model.route)

    return Update.combineSteps([
      makeFieldsStep(() => ({ route: () => nextRoute })),
      isSearchRefreshNeeded ? searchQueryStep : makeNoopStep(),
    ])
  }),

  ClickedLink: makeCommandsStep.fromMessage(({ request }) =>
    UrlRequest.match(request, {
      Internal: ({ url }) => [NavigateInternal({ url: Url.toString(url) })],
      External: ({ href }) => [LoadExternal({ href })],
    }),
  ),

  UpdatedTldFilter: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({ tldFilter: () => value })),
      loadRequiredQuotesStep,
      informResultsListStep,
    ]),
  ),

  UpdatedAvailabilityFilter: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({ availabilityFilter: () => value })),
      loadRequiredQuotesStep,
      informResultsListStep,
    ]),
  ),

  UpdatedSortOrder: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({ sortOrder: () => value })),
      loadRequiredQuotesStep,
      informResultsListStep,
    ]),
  ),

  ClickedAddDomain: makeFieldsStep((model, { domain }) =>
    Domain.isAnyOf(['Available'])(domain) &&
    !Array.some(model.cart, item => item.name === domain.name)
      ? { cart: Array.append(domain) }
      : {},
  ),

  ClickedRemoveDomain: makeFieldsStep.fromMessage(({ name }) => ({
    cart: Array.filter(domain => domain.name !== name),
  })),

  ClickedRemoveCartDomain: makeStep.fromMessage(
    ({ name }: typeof Message.ClickedRemoveCartDomain.Type) =>
      Update.combineSteps([
        makeFieldsStep(() => ({
          cart: Array.filter(domain => domain.name !== name),
        })),
        makeCommandsStep(() => [FocusCartCloseButton()]),
      ]),
  ),

  ClickedCart: CartDialogBinding.requestOpen(),

  ClickedFilters: FiltersDialogBinding.requestOpen(),

  CompletedDetermineSearchTime: startQuoteWindowStep,

  ClickedDomainsHome: makeNoopStep(),
  ClickedSkipToMain: makeNoopStep(),
  CompletedReplaceSearchUrl: makeNoopStep(),
  CompletedNavigateInternal: makeNoopStep(),
  CompletedLoadExternal: makeNoopStep(),
  CompletedFocusSearchInput: makeNoopStep(),
  CompletedFocusCartButton: makeNoopStep(),
  CompletedFocusFiltersButton: makeNoopStep(),
  CompletedFocusCartCloseButton: makeNoopStep(),
  CompletedScrollPage: makeNoopStep(),
  CompletedRevealResultsListStart: makeNoopStep(),
  CompletedDismissSearchKeyboard: makeNoopStep(),
  CompletedReleaseEarlySearchListeners: makeNoopStep(),
})
