import { Array } from 'effect'

import {
  DomainListing,
  matchesTldFilter,
  pendingDomains,
  visibleDomains,
} from './domain'
import { Model, SearchState } from './model'
import { routeToQuery } from './route'

export const visibleResultListings = (
  model: typeof Model.Type,
): ReadonlyArray<typeof DomainListing.Type> =>
  SearchState.match(model.search, {
    Idle: () =>
      Array.filter(pendingDomains(routeToQuery(model.route)), domain =>
        matchesTldFilter(domain, model.tldFilter),
      ),
    Loading: () =>
      Array.filter(pendingDomains(routeToQuery(model.route)), domain =>
        matchesTldFilter(domain, model.tldFilter),
      ),
    Ready: ({ domains }) =>
      Array.map(
        visibleDomains(
          domains,
          model.tldFilter,
          model.availabilityFilter,
          model.sortOrder,
        ),
        DomainListing.Ready,
      ),
    Failed: () => [],
  })
