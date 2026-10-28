import { Array, Match, pipe } from 'effect'

import {
  DomainListing,
  matchesTldFilter,
  queryToPendingDomainListings,
  visibleDomainListings,
} from './domain'
import { Model } from './model'
import { routeToQuery } from './route'
import { searchPresentation } from './searchPresentation'

export const visibleResultListings = (
  model: Model,
): ReadonlyArray<DomainListing> =>
  Match.value(searchPresentation(model)).pipe(
    Match.tag('Idle', 'Loading', () =>
      pipe(
        model.route,
        routeToQuery,
        queryToPendingDomainListings,
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
