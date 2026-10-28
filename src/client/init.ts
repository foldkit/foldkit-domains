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
      searchMode: 'Demo',
      searchGeneration: 0,
      searchPlanningTimeMillis: 0,
      domainCandidateRanges: [],
      maybeBlockedDomainCandidateRange: Option.none(),
      maybeSearchCooldown: Option.none(),
      tldFilter: 'All',
      tldSearchQuery: '',
      availabilityFilter: 'All',
      sortOrder: 'Relevance',
      carts: { Demo: [], Live: [] },
    },
    commands: [ReleaseEarlySearchListeners()],
    steps: [searchQueryStep],
  }
})
