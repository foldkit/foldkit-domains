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
  LiveWarningDialogBinding,
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
  changeDataSource,
  changeSearchQuery,
  clearSearch,
  loadDomainsForRange,
  retrySearch,
  scheduleDomainRequest,
  searchQuery,
  updateAvailabilityFilter,
  updateSortOrder,
  updateTldFilter,
} from './steps'

export const update = ApplicationComposition.makeUpdate({
  UpdatedSearch: (model, { value }) => changeSearchQuery(value)(model),

  RequestedSearch: model => searchQuery(routeToQuery(model.route))(model),

  ReachedSearchCooldownExpiry: makeFieldsStep.fromMessage(({ nowMillis }) => ({
    maybeSearchCooldown: Option.filter(
      cooldown => cooldown.expiresAtMillis > nowMillis,
    ),
  })),

  RequestedDomains: makeStep.fromMessage(({ offset, limit }) =>
    scheduleDomainRequest({ offset, limit }),
  ),

  SubmittedSearch: model =>
    Update.combineSteps(model, [
      searchQuery(routeToQuery(model.route), true),
      makeCommandsStep(() => [DismissSearchKeyboard()]),
    ]),

  UpdatedLiveLatencyAcceptance: makeFieldsStep.fromMessage(
    ({ isAccepted }) => ({
      isLiveLatencyAccepted: () => isAccepted,
    }),
  ),

  ClickedContinueToLive: Update.combineSteps([
    changeDataSource('Live'),
    LiveWarningDialogBinding.requestClose(),
  ]),

  ClickedRetrySearch: Update.combineSteps([
    retrySearch,
    makeCommandsStep(() => [FocusSearchInput()]),
  ]),

  PressedEscape: clearSearch,

  FocusedResultsList: makeCommandsStep(() => [RevealResultsListStart()]),

  PressedResultsListScrollKey: makeStep.fromMessage(({ key }) =>
    Match.value(key).pipe(
      Match.when('End', () => ResultsListBinding.requestScrollToEnd()),
      Match.orElse(key => makeCommandsStep(() => [ScrollPage({ key })])),
    ),
  ),

  ClickedClearSearch: Update.combineSteps([
    clearSearch,
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
      isSearchRefreshNeeded ? searchQuery(nextQuery) : makeNoopStep(),
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

  UpdatedTldFilter: makeStep.fromMessage(({ value }) => updateTldFilter(value)),

  UpdatedAvailabilityFilter: makeStep.fromMessage(({ value }) =>
    updateAvailabilityFilter(value),
  ),

  UpdatedSortOrder: makeStep.fromMessage(({ value }) => updateSortOrder(value)),

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

  ClickedMobileTldOption: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      updateTldFilter(value),
      TldDialogBinding.requestClose(),
    ]),
  ),

  ClickedMobileAvailabilityOption: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      updateAvailabilityFilter(value),
      FiltersDialogBinding.requestClose(),
    ]),
  ),

  ClickedMobileSortOption: makeStep.fromMessage(({ value }) =>
    Update.combineSteps([
      updateSortOrder(value),
      FiltersDialogBinding.requestClose(),
    ]),
  ),

  CompletedReadCurrentTime: loadDomainsForRange,

  CompletedReleaseEarlySearchListeners: makeFieldsStep.fromMessage(
    ({ isSearchStarted }) => ({
      searchLayout: currentLayout =>
        isSearchStarted ? 'Search' : currentLayout,
    }),
  ),

  CompletedFocusDataSourceButton: makeNoopStep(),
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
})
