import { Match } from 'effect'

import { DomainListing, visibleDomainListings } from './domain'
import { Model } from './model'
import { routeToQuery } from './route'
import { searchPresentation } from './searchPresentation'

export const visibleResultListings = (
  model: Model,
): ReadonlyArray<DomainListing> =>
  Match.value(searchPresentation(model)).pipe(
    Match.tag('Idle', 'Loading', () =>
      visibleDomainListings(
        routeToQuery(model.route),
        [],
        model.tldFilter,
        model.availabilityFilter,
        model.sortOrder,
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
