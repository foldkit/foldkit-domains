import { Array, Option, String } from 'effect'
import { Url } from 'foldkit'
import { UrlRequest } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'

import { FetchDomains, FocusSearch, Navigate, SyncSearchUrl } from './command'
import { ApplicationComposition } from './composition'
import { domainLabel, queryFromUrl } from './domain'
import { Message } from './message'
import { Model, SearchState } from './model'

const cancelSearch = () =>
  FetchDomains.Interrupt(() => Message.CompletedCancelSearch())

export const startSearch = (model: typeof Model.Type, query: string) => {
  const revision = model.revision + 1
  const nextModel = modifyFields(model, {
    query: () => query,
    revision: () => revision,
  })

  if (String.isEmpty(query)) {
    return {
      model: modifyFields(nextModel, { search: () => SearchState.Idle() }),
      commands: [cancelSearch()],
    }
  } else {
    return Option.match(domainLabel(query), {
      onNone: () => ({
        model: modifyFields(nextModel, {
          search: () =>
            SearchState.Failed({
              error:
                'Enter a domain name using letters, numbers, and hyphens (up to 63 characters).',
            }),
        }),
        commands: [cancelSearch()],
      }),
      onSome: label => ({
        model: modifyFields(nextModel, { search: () => SearchState.Loading() }),
        commands: [cancelSearch(), FetchDomains({ label, revision })],
      }),
    })
  }
}

const changeSearch = (model: typeof Model.Type, query: string) => {
  const searchChange = startSearch(model, query)
  return {
    model: searchChange.model,
    commands: [...(searchChange.commands ?? []), SyncSearchUrl({ query })],
  }
}

export const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    UpdatedSearch: ({ value }) => changeSearch(model, value),
    SubmittedSearch: () => startSearch(model, model.query),
    ClickedRetrySearch: () => startSearch(model, model.query),
    PressedEscape: () => changeSearch(model, ''),
    ClickedClearSearch: () => {
      const searchClear = changeSearch(model, '')
      return {
        model: searchClear.model,
        commands: [...(searchClear.commands ?? []), FocusSearch()],
      }
    },
    ChangedUrl: ({ url }) => {
      const query = queryFromUrl(url)
      return query === model.query ? { model } : startSearch(model, query)
    },
    ClickedLink: ({ request }) =>
      UrlRequest.match(request, {
        Internal: ({ url }) => ({
          model,
          commands: [Navigate({ href: Url.toString(url), isExternal: false })],
        }),
        External: ({ href }) => ({
          model,
          commands: [Navigate({ href, isExternal: true })],
        }),
      }),
    UpdatedTld: ({ value }) => ({
      model: modifyFields(model, { tld: () => value }),
    }),
    UpdatedAvailability: ({ value }) => ({
      model: modifyFields(model, { availability: () => value }),
    }),
    UpdatedSorting: ({ value }) => ({
      model: modifyFields(model, { sorting: () => value }),
    }),
    ClickedAddDomain: ({ domain }) => ({
      model:
        domain.isAvailable &&
        !model.cart.some(item => item.name === domain.name)
          ? modifyFields(model, { cart: Array.append(domain) })
          : model,
    }),
    ClickedRemoveDomain: ({ name }) => ({
      model: modifyFields(model, {
        cart: Array.filter(domain => domain.name !== name),
      }),
    }),
    ClickedCart: () => ({
      model: modifyFields(model, { cartVisibility: () => 'Open' }),
    }),
    ClickedCloseCart: () => ({
      model: modifyFields(model, { cartVisibility: () => 'Closed' }),
    }),
    SucceededFetchDomains: ({ revision, domains }) => ({
      model:
        revision === model.revision
          ? modifyFields(model, {
              search: () => SearchState.Ready({ domains }),
            })
          : model,
    }),
    FailedFetchDomains: ({ revision, error }) => ({
      model:
        revision === model.revision
          ? modifyFields(model, { search: () => SearchState.Failed({ error }) })
          : model,
    }),
    CompletedSyncSearchUrl: () => ({ model }),
    CompletedNavigate: () => ({ model }),
    CompletedFocusSearch: () => ({ model }),
    CompletedCancelSearch: () => ({ model }),
    CompletedReleaseEarlySearchListeners: () => ({ model }),
  }),
)
