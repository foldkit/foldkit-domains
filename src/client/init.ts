import { Option, String } from 'effect'
import { Url } from 'foldkit'

import { ReleaseEarlySearchListeners } from './command'
import { ApplicationComposition } from './composition'
import { routeToQuery, urlToApplicationRoute } from './route'
import { searchCurrentQueryStep } from './steps/index'

export const init = ApplicationComposition.makeInit((url: Url.Url) => {
  const route = urlToApplicationRoute(url)

  return {
    model: {
      route,
      searchLayout: String.isNonEmpty(routeToQuery(route))
        ? 'Search'
        : 'Landing',
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
    steps: [searchCurrentQueryStep],
  }
})
