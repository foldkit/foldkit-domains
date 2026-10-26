import { Url } from 'foldkit'

import { ReleaseEarlySearchListeners } from './command'
import { ApplicationComposition } from './composition'
import { SearchState } from './model'
import { urlToApplicationRoute } from './route'
import { searchCurrentQueryStep } from './update'

export const init = ApplicationComposition.makeInit((url: Url.Url) => {
  return {
    model: {
      route: urlToApplicationRoute(url),
      searchGeneration: 0,
      search: SearchState.Idle(),
      tldFilter: 'All',
      availabilityFilter: 'All',
      sortOrder: 'Relevance',
      cart: [],
      cartVisibility: 'Closed',
    },
    commands: [ReleaseEarlySearchListeners()],
    steps: [searchCurrentQueryStep],
  }
})
