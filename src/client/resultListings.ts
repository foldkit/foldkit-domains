import { Match } from 'effect'

import { DomainListing, filterAndSortDomainListings } from './domain'
import { Model } from './model'
import { routeToQuery } from './route'
import { searchPresentation } from './searchPresentation'

export const resultListings = (model: Model): ReadonlyArray<DomainListing> =>
  Match.value(searchPresentation(model)).pipe(
    Match.tag('Idle', 'Loading', () =>
      filterAndSortDomainListings(
        routeToQuery(model.route),
        [],
        model.tldFilter,
        model.availabilityFilter,
        model.sortOrder,
      ),
    ),
    Match.tag('Ready', ({ domains }) =>
      filterAndSortDomainListings(
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
