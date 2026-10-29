import { Array, Match, Option, String } from 'effect'
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
  ScrollPageToTop,
} from './command'
import {
  ApplicationComposition,
  CartDialogBinding,
  FiltersDialogBinding,
  ResultsListBinding,
  TldDialogBinding,
} from './composition'
import {
  makeCommandsStep,
  makeFieldsStep,
  makeNoopStep,
  makeStep,
} from './definition'
import { Message } from './message'
import { activeCart, updateActiveCart } from './model'
import { ApplicationRoute, routeToQuery, urlToApplicationRoute } from './route'
import {
  clearSearchStep,
  continueToLiveStep,
  loadQuotesForRangeStep,
  makeChangeAvailabilityFilterStep,
  makeChangeSearchQueryStep,
  makeChangeSortOrderStep,
  makeChangeTldFilterStep,
  makeRequestQuotesForRangeStep,
  makeSearchQueryStep,
  retrySearchStep,
  searchQueryStep,
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
    makeRequestQuotesForRangeStep({ offset, limit }),
  ),

  SubmittedSearch: Update.combineSteps([
    makeSearchQueryStep(true),
    makeCommandsStep(() => [DismissSearchKeyboard()]),
  ]),

  UpdatedLiveLatencyAcceptance: makeFieldsStep.fromMessage(
    ({ isAccepted }) => ({
      isLiveLatencyAccepted: () => isAccepted,
    }),
  ),

  ClickedContinueToLive: continueToLiveStep,

  CompletedFocusSearchModeButton: makeNoopStep(),

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
      isSearchRefreshNeeded &&
      ApplicationRoute.isAnyOf(['Search'])(nextRoute) &&
      String.isEmpty(routeToQuery(nextRoute))
        ? makeCommandsStep(() => [ScrollPageToTop()])
        : makeNoopStep(),
    ])
  }),

  ClickedLink: makeCommandsStep.fromMessage(({ request }) =>
    UrlRequest.match(request, {
      Internal: ({ url }) => [NavigateInternal({ url: Url.toString(url) })],
      External: ({ href }) => [LoadExternal({ href })],
    }),
  ),

  UpdatedTldFilter: makeStep.fromMessage(({ value }) =>
    makeChangeTldFilterStep(value),
  ),

  UpdatedAvailabilityFilter: makeStep.fromMessage(({ value }) =>
    makeChangeAvailabilityFilterStep(value),
  ),

  UpdatedSortOrder: makeStep.fromMessage(({ value }) =>
    makeChangeSortOrderStep(value),
  ),

  ClickedAddDomain: makeFieldsStep((model, { domain }) =>
    Domain.isAnyOf(['Available'])(domain) &&
    !Array.some(activeCart(model), item => item.name === domain.name)
      ? { carts: () => updateActiveCart(model, Array.append(domain)) }
      : {},
  ),

  ClickedRemoveDomain: makeFieldsStep((model, { name }) => ({
    carts: () =>
      updateActiveCart(
        model,
        Array.filter(domain => domain.name !== name),
      ),
  })),

  ClickedRemoveCartDomain: makeStep.fromMessage(
    ({ name }: typeof Message.ClickedRemoveCartDomain.Type) =>
      Update.combineSteps([
        makeFieldsStep(model => ({
          carts: () =>
            updateActiveCart(
              model,
              Array.filter(domain => domain.name !== name),
            ),
        })),
        makeCommandsStep(() => [FocusCartCloseButton()]),
      ]),
  ),

  ClickedCart: CartDialogBinding.requestOpen(),

  ClickedFilters: FiltersDialogBinding.requestOpen(),

  ClickedTldFilter: Update.combineSteps([
    makeFieldsStep(() => ({ tldSearchQuery: () => '' })),
    TldDialogBinding.requestOpen(),
  ]),

  UpdatedTldSearch: makeFieldsStep.fromMessage(({ value }) => ({
    tldSearchQuery: () => value,
  })),

  ClickedTldOption: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      makeChangeTldFilterStep(value),
      TldDialogBinding.requestClose(),
    ]),
  ),

  ClickedAvailabilityOption: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      makeChangeAvailabilityFilterStep(value),
      FiltersDialogBinding.requestClose(),
    ]),
  ),

  ClickedSortOption: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      makeChangeSortOrderStep(value),
      FiltersDialogBinding.requestClose(),
    ]),
  ),

  CompletedReadSearchPlanningTime: loadQuotesForRangeStep,

  ClickedDomainsHome: makeNoopStep(),
  ClickedSkipToMain: makeNoopStep(),
  CompletedReplaceSearchUrl: makeNoopStep(),
  CompletedNavigateInternal: makeNoopStep(),
  CompletedLoadExternal: makeNoopStep(),
  CompletedFocusSearchInput: makeNoopStep(),
  CompletedFocusCartButton: makeNoopStep(),
  CompletedFocusFiltersButton: makeNoopStep(),
  CompletedFocusTldFilterButton: makeNoopStep(),
  CompletedFocusCartCloseButton: makeNoopStep(),
  CompletedScrollPage: makeNoopStep(),
  CompletedScrollPageToTop: makeNoopStep(),
  CompletedRevealResultsListStart: makeNoopStep(),
  CompletedDismissSearchKeyboard: makeNoopStep(),
  CompletedReleaseEarlySearchListeners: makeFieldsStep.fromMessage(
    ({ isSearchStarted }) => ({
      searchLayout: currentLayout =>
        isSearchStarted ? 'Search' : currentLayout,
    }),
  ),
})
