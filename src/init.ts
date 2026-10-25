import { Url } from 'foldkit'

import { ReleaseEarlySearchListeners } from './command'
import { ApplicationComposition } from './composition'
import { queryFromUrl } from './domain'
import { Model, SearchState } from './model'
import { startSearch } from './update'

export const init = ApplicationComposition.makeInit((url: Url.Url) => {
  const model = Model.make({
    query: '',
    revision: 0,
    search: SearchState.Idle(),
    tld: 'All',
    availability: 'All',
    sorting: 'Relevance',
    cart: [],
    cartVisibility: 'Closed',
  })
  const searchInit = startSearch(model, queryFromUrl(url))
  return {
    model: searchInit.model,
    commands: [ReleaseEarlySearchListeners(), ...(searchInit.commands ?? [])],
  }
})
