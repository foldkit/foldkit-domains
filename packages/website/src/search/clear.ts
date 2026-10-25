import { SearchDefinition } from './definition'
import { SearchState } from './domain'

export const clearSearchQuery = SearchDefinition.makeFieldsStep(() => ({
  query: () => '',
  searchState: () => SearchState.Idle(),
  activeResultIndex: () => -1,
}))
