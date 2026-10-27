import { Option } from 'effect'
import { Url } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { searchDomains } from './domain'
import { Model, SearchState } from './model'
import {
  RESULTS_GROUP_HEIGHT_PX,
  RESULTS_LIST_ID,
  ResultsListBlock,
} from './resultsList'
import { ApplicationRoute } from './route'

export const emptyModel = Model.make({
  route: ApplicationRoute.Search({ q: Option.none() }),
  searchGeneration: 0,
  search: SearchState.Idle(),
  resultsList: ResultsListBlock.init({
    id: RESULTS_LIST_ID,
    rowHeightPx: RESULTS_GROUP_HEIGHT_PX,
  }).model,
  tldFilter: 'All',
  availabilityFilter: 'All',
  sortOrder: 'Relevance',
  cart: [],
  cartVisibility: 'Closed',
})

export const readyModel = (query: string): typeof Model.Type =>
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
