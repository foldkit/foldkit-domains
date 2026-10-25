import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'

import type { ApplicationRoute } from '../../route'
import { FetchPeople, PushSearchUrl } from './command'
import { PeopleComposition } from './composition'
import { Message } from './message'
import {
  Model,
  SearchResults,
  addSearchToHistory,
  routeSearchText,
} from './model'

export const init = PeopleComposition.makeInit(
  (route: typeof ApplicationRoute.People.Type) => {
    const searchText = routeSearchText(route)
    return {
      model: Model.make({
        searchInput: searchText,
        searchHistory: addSearchToHistory([], searchText),
        results: SearchResults.Loading(),
      }),
      commands: [FetchPeople({ searchText })],
    }
  },
)
export const update = PeopleComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ChangedSearchInput: ({ value }) => ({
      model: modifyFields(model, { searchInput: () => value }),
    }),

    SubmittedSearch: () => ({
      model,
      commands: [
        PushSearchUrl({
          searchText: Option.fromNullishOr(model.searchInput || null),
        }),
      ],
    }),

    InformedOfRouteChange: ({ route }) => {
      const searchText = routeSearchText(route)
      return {
        model: modifyFields(model, {
          searchInput: () => searchText,
          searchHistory: searchHistory =>
            addSearchToHistory(searchHistory, searchText),
          results: () => SearchResults.Loading(),
        }),
        commands: [FetchPeople({ searchText })],
      }
    },

    CompletedFetchPeople: ({ query, people: fetchedPeople }) => ({
      model: modifyFields(model, {
        results: () => SearchResults.Loaded({ query, people: fetchedPeople }),
      }),
    }),

    CompletedPushSearchUrl: () => ({ model }),
  }),
)
