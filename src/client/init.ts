import { Option, String } from 'effect'
import { Url } from 'foldkit'

import { ReleaseEarlySearchListeners } from './command'
import { ApplicationComposition } from './composition'
import { routeToQuery, urlToApplicationRoute } from './route'
import { searchQueryStep } from './steps'

export const init = ApplicationComposition.makeInit((url: Url.Url) => {
  const route = urlToApplicationRoute(url)
  const query = routeToQuery(route)

  return {
    model: {
      route,
      searchLayout: String.isNonEmpty(query) ? 'Search' : 'Landing',
      dataSource: 'Demo',
      isLiveLatencyAccepted: false,
      searchGeneration: 0,
      searchPlanningTimeMillis: 0,
      activeDomainCandidateRanges: [],
      maybeBlockedDomainCandidateRange: Option.none(),
      maybeSearchCooldown: Option.none(),
      tldFilter: 'All',
      tldSearchQuery: '',
      availabilityFilter: 'All',
      sortOrder: 'Relevance',
      carts: { Demo: [], Live: [] },
    },
    commands: [ReleaseEarlySearchListeners()],
    steps: [searchQueryStep(query)],
  }
})
