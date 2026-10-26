import { Array, Match, Number, Option, String } from 'effect'
import { Update, Url } from 'foldkit'
import { UrlRequest } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'

import {
  FetchDomains,
  FocusSearchInput,
  LoadExternal,
  NavigateInternal,
  ReplaceSearchUrl,
  cancelSearch,
} from './command'
import { ApplicationComposition, ResultsListBinding } from './composition'
import {
  makeCommandsStep,
  makeFieldsStep,
  makeNoopStep,
  makeStep,
} from './definition'
import { queryToMaybeDomainLabel } from './domain'
import { Message } from './message'
import { SearchState } from './model'
import { visibleResultListings } from './results'
import { groupResults } from './resultsList'
import { routeToQuery, urlToApplicationRoute } from './route'

const updateCurrentSearchStep = makeStep(model => {
  const query = routeToQuery(model.route)
  const baseCommands = [cancelSearch()]

  return Match.value({
    query,
    maybeDomainLabel: queryToMaybeDomainLabel(query),
  }).pipe(
    Match.when({ query: String.isEmpty }, () => ({
      model: modifyFields(model, {
        searchGeneration: Number.increment,
        search: () => SearchState.Idle(),
      }),
      commands: baseCommands,
    })),
    Match.when({ maybeDomainLabel: Option.isSome }, ({ maybeDomainLabel }) => {
      const nextSearchGeneration = Number.increment(model.searchGeneration)

      return {
        model: modifyFields(model, {
          searchGeneration: () => nextSearchGeneration,
          search: () => SearchState.Loading(),
        }),
        commands: Array.append(
          baseCommands,
          FetchDomains({
            label: maybeDomainLabel.value,
            searchGeneration: nextSearchGeneration,
          }),
        ),
      }
    }),
    Match.orElse(() => ({
      model: modifyFields(model, {
        searchGeneration: Number.increment,
        search: () =>
          SearchState.Failed({
            error:
              'Enter a domain name using letters, numbers, and hyphens (up to 63 characters).',
          }),
      }),
      commands: baseCommands,
    })),
  )
})

const informResultsListStep = makeStep(model =>
  ResultsListBinding.informItemsChanged(
    Array.map(groupResults(visibleResultListings(model)), row => row.id),
  ),
)

export const searchCurrentQueryStep = Update.combineSteps([
  updateCurrentSearchStep,
  informResultsListStep,
])

const makeChangeSearchQueryStep = (query: string) =>
  makeStep(model => {
    const replaceSearchUrl = ReplaceSearchUrl({
      q: Option.liftPredicate(query, String.isNonEmpty),
    })

    const currentQuery = routeToQuery(model.route)

    return Match.value(currentQuery).pipe(
      Match.when(query, () => ({ model, commands: [replaceSearchUrl] })),
      Match.orElse(() => ({
        model: modifyFields(model, { searchGeneration: Number.increment }),
        commands: [cancelSearch(), replaceSearchUrl],
      })),
    )
  })

const clearSearchStep = makeChangeSearchQueryStep('')

export const update = ApplicationComposition.makeUpdate({
  UpdatedSearch: (model, { value }) => makeChangeSearchQueryStep(value)(model),
  SubmittedSearch: searchCurrentQueryStep,
  ClickedRetrySearch: searchCurrentQueryStep,
  PressedEscape: clearSearchStep,
  ClickedClearSearch: Update.combineSteps([
    clearSearchStep,
    makeCommandsStep(() => [FocusSearchInput()]),
  ]),
  ChangedUrl: makeStep((model, { url }: typeof Message.ChangedUrl.Type) => {
    const nextRoute = urlToApplicationRoute(url)

    const isSearchRefreshNeeded =
      nextRoute._tag !== model.route._tag ||
      routeToQuery(nextRoute) !== routeToQuery(model.route)

    if (isSearchRefreshNeeded) {
      return Update.combineSteps([
        makeFieldsStep(() => ({ route: () => nextRoute })),
        searchCurrentQueryStep,
      ])
    } else {
      return { model: modifyFields(model, { route: () => nextRoute }) }
    }
  }),
  ClickedLink: makeCommandsStep.fromMessage(({ request }) =>
    UrlRequest.match(request, {
      Internal: ({ url }) => [NavigateInternal({ url: Url.toString(url) })],
      External: ({ href }) => [LoadExternal({ href })],
    }),
  ),
  UpdatedTldFilter: makeStep(
    (_model, { value }: typeof Message.UpdatedTldFilter.Type) =>
      Update.combineSteps([
        makeFieldsStep(() => ({ tldFilter: () => value })),
        informResultsListStep,
      ]),
  ),
  UpdatedAvailabilityFilter: makeStep(
    (_model, { value }: typeof Message.UpdatedAvailabilityFilter.Type) =>
      Update.combineSteps([
        makeFieldsStep(() => ({ availabilityFilter: () => value })),
        informResultsListStep,
      ]),
  ),
  UpdatedSortOrder: makeStep(
    (_model, { value }: typeof Message.UpdatedSortOrder.Type) =>
      Update.combineSteps([
        makeFieldsStep(() => ({ sortOrder: () => value })),
        informResultsListStep,
      ]),
  ),
  ClickedAddDomain: makeFieldsStep((model, { domain }) =>
    domain.isAvailable &&
    !Array.some(model.cart, item => item.name === domain.name)
      ? { cart: Array.append(domain) }
      : {},
  ),
  ClickedRemoveDomain: makeFieldsStep.fromMessage(({ name }) => ({
    cart: Array.filter(domain => domain.name !== name),
  })),
  ClickedCart: makeFieldsStep(() => ({
    cartVisibility: () => 'Open',
  })),
  ClickedCloseCart: makeFieldsStep(() => ({
    cartVisibility: () => 'Closed',
  })),
  SucceededFetchDomains: makeStep(
    (
      model,
      { searchGeneration, domains }: typeof Message.SucceededFetchDomains.Type,
    ) => {
      if (searchGeneration === model.searchGeneration) {
        return Update.combineSteps([
          makeFieldsStep(() => ({
            search: () => SearchState.Ready({ domains }),
          })),
          informResultsListStep,
        ])
      } else {
        return { model }
      }
    },
  ),
  FailedFetchDomains: makeFieldsStep((model, { searchGeneration, error }) =>
    searchGeneration === model.searchGeneration
      ? { search: () => SearchState.Failed({ error }) }
      : {},
  ),
  CompletedReplaceSearchUrl: makeNoopStep(),
  CompletedNavigateInternal: makeNoopStep(),
  CompletedLoadExternal: makeNoopStep(),
  CompletedFocusSearchInput: makeNoopStep(),
  CompletedCancelSearch: makeNoopStep(),
  CompletedReleaseEarlySearchListeners: makeNoopStep(),
})
