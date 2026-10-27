import { Array, Match, pipe } from 'effect'

import {
  DomainListing,
  matchesTldFilter,
  queryToPendingDomains,
  visibleDomainListings,
} from './domain'
import { Model } from './model'
import { routeToQuery } from './route'

export const visibleResultListings = (
  model: typeof Model.Type,
): ReadonlyArray<typeof DomainListing.Type> =>
  Match.value(model.search).pipe(
    Match.tag('Idle', 'Loading', () =>
      pipe(
        model.route,
        routeToQuery,
        queryToPendingDomains,
        Array.filter(matchesTldFilter(model.tldFilter)),
      ),
    ),
    Match.tag('Ready', ({ domains }) =>
      visibleDomainListings(
        routeToQuery(model.route),
        domains,
        model.tldFilter,
        model.availabilityFilter,
        model.sortOrder,
      ),
    ),
    Match.tag('Failed', () => []),
    Match.exhaustive,
  )
