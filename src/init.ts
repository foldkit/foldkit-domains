import { Url } from 'foldkit'

import { ReleaseEarlySearchListeners } from './command'
import { ApplicationComposition } from './composition'
import { Model, SearchState } from './model'
import { urlToApplicationRoute } from './route'
import { searchCurrentQueryStep } from './update'

export const init = ApplicationComposition.makeInit((url: Url.Url) => {
  const model = Model.make({
    route: urlToApplicationRoute(url),
    searchGeneration: 0,
    search: SearchState.Idle(),
    tldFilter: 'All',
    availabilityFilter: 'All',
    sortOrder: 'Relevance',
    cart: [],
    cartVisibility: 'Closed',
  })

  return {
    model,
    commands: [ReleaseEarlySearchListeners()],
    steps: [searchCurrentQueryStep],
  }
})
