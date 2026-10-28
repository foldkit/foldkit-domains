import { Option } from 'effect'
import { Url } from 'foldkit'

import { ReleaseEarlySearchListeners } from './command'
import { ApplicationComposition } from './composition'
import { urlToApplicationRoute } from './route'
import { searchQueryStep } from './steps/index'

export const init = ApplicationComposition.makeInit((url: Url.Url) => {
  return {
    model: {
      route: urlToApplicationRoute(url),
      searchGeneration: 0,
      searchTimeMillis: 0,
      quotePlan: [],
      maybeBlockedQuoteWindow: Option.none(),
      maybeSearchCooldown: Option.none(),
      tldFilter: 'All',
      availabilityFilter: 'All',
      sortOrder: 'Relevance',
      cart: [],
    },
    commands: [ReleaseEarlySearchListeners()],
    steps: [searchQueryStep],
  }
})
