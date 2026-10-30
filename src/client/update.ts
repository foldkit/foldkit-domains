import { Array, Match, Option, String } from 'effect'
import { Update, Url } from 'foldkit'
import { UrlRequest } from 'foldkit/navigation'

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
import { Cart } from './domain'
import { ApplicationRoute, routeToQuery, urlToApplicationRoute } from './route'
import {
  changeAvailabilityFilterStep,
  changeSearchQueryStep,
  changeSortOrderStep,
  changeTldFilterStep,
  clearSearchStep,
  continueToLiveStep,
  loadDomainsForRangeStep,
  retrySearchStep,
  scheduleDomainRequestStep,
  searchQueryStep,
} from './steps'

export const update = ApplicationComposition.makeUpdate({
  UpdatedSearch: (model, { value }) => changeSearchQueryStep(value)(model),

  RequestedSearch: model => searchQueryStep(routeToQuery(model.route))(model),

  ReachedSearchCooldownExpiry: makeFieldsStep.fromMessage(({ nowMillis }) => ({
    maybeSearchCooldown: Option.filter(
      cooldown => cooldown.expiresAtMillis > nowMillis,
    ),
  })),

  RequestedDomains: makeStep.fromMessage(({ offset, limit }) =>
    scheduleDomainRequestStep({ offset, limit }),
  ),

  SubmittedSearch: model =>
    Update.combineSteps(model, [
      searchQueryStep(routeToQuery(model.route), true),
      makeCommandsStep(() => [DismissSearchKeyboard()]),
    ]),

  UpdatedLiveLatencyAcceptance: makeFieldsStep.fromMessage(
    ({ isAccepted }) => ({
      isLiveLatencyAccepted: () => isAccepted,
    }),
  ),

  ClickedContinueToLive: continueToLiveStep,

  CompletedFocusDataSourceButton: makeNoopStep(),

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

  ChangedUrl: (model, { url }) => {
    const nextRoute = urlToApplicationRoute(url)
    const nextQuery = routeToQuery(nextRoute)

    const isSearchRefreshNeeded = nextQuery !== routeToQuery(model.route)

    const shouldScrollToTop =
      isSearchRefreshNeeded &&
      ApplicationRoute.guards.Search(nextRoute) &&
      String.isEmpty(nextQuery)

    return Update.combineSteps(model, [
      makeFieldsStep(() => ({ route: () => nextRoute })),
      isSearchRefreshNeeded ? searchQueryStep(nextQuery) : makeNoopStep(),
      shouldScrollToTop
        ? makeCommandsStep(() => [ScrollPageToTop()])
        : makeNoopStep(),
    ])
  },

  ClickedLink: makeCommandsStep.fromMessage(({ request }) =>
    UrlRequest.match(request, {
      Internal: ({ url }) => [NavigateInternal({ url: Url.toString(url) })],
      External: ({ href }) => [LoadExternal({ href })],
    }),
  ),

  UpdatedTldFilter: makeStep.fromMessage(({ value }) =>
    changeTldFilterStep(value),
  ),

  UpdatedAvailabilityFilter: makeStep.fromMessage(({ value }) =>
    changeAvailabilityFilterStep(value),
  ),

  UpdatedSortOrder: makeStep.fromMessage(({ value }) =>
    changeSortOrderStep(value),
  ),

  ClickedAddDomain: makeFieldsStep((model, { domain }) => {
    const isDomainInCart = Array.some(
      Cart.forDataSource(model.carts, model.dataSource),
      item => item.name === domain.name,
    )

    return isDomainInCart
      ? {}
      : {
          carts: Cart.updateForDataSource(
            model.dataSource,
            Array.append(domain),
          ),
        }
  }),

  ClickedRemoveDomain: makeFieldsStep((model, { name }) => ({
    carts: Cart.updateForDataSource(
      model.dataSource,
      Array.filter(domain => domain.name !== name),
    ),
  })),

  ClickedRemoveCartDomain: makeStep.fromMessage(({ name }) =>
    Update.combineSteps([
      makeFieldsStep(model => ({
        carts: Cart.updateForDataSource(
          model.dataSource,
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
      changeTldFilterStep(value),
      TldDialogBinding.requestClose(),
    ]),
  ),

  ClickedAvailabilityOption: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      changeAvailabilityFilterStep(value),
      FiltersDialogBinding.requestClose(),
    ]),
  ),

  ClickedSortOption: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      changeSortOrderStep(value),
      FiltersDialogBinding.requestClose(),
    ]),
  ),

  CompletedReadCurrentTime: loadDomainsForRangeStep,

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
