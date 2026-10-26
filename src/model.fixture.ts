import { Option } from 'effect'
import { Url } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { searchDomains } from './domain'
import { Model, SearchState } from './model'
import { ApplicationRoute } from './route'

export const emptyModel = Model.make({
  route: ApplicationRoute.Search({ q: Option.none() }),
  searchGeneration: 0,
  search: SearchState.Idle(),
  tldFilter: 'All',
  availabilityFilter: 'All',
  sortOrder: 'Relevance',
  cart: [],
  cartVisibility: 'Closed',
})

export const readyModel = (query: string) =>
  modifyFields(emptyModel, {
    route: () => ApplicationRoute.Search({ q: Option.some(query) }),
    searchGeneration: () => 1,
    search: () => SearchState.Ready({ domains: searchDomains(query) }),
  })

export const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(
    Url.fromString(raw),
    () => new Error(`Failed to parse URL: ${raw}`),
  )
