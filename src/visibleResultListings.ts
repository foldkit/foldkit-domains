import { Array, Match, pipe } from 'effect'

import {
  DomainListing,
  domainToListing,
  matchesTldFilter,
  queryToDomainListings,
  queryToPendingDomains,
  visibleDomains,
} from './domain'
import { Model } from './model'
import { routeToQuery } from './route'

// should this be in the domain file?
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
    Match.tag('Ready', ({ domains }) => {
      const listings = queryToDomainListings(routeToQuery(model.route), domains)
      if (model.sortOrder === 'Relevance') {
        return Array.filter(
          listings,
          listing =>
            matchesTldFilter(model.tldFilter)(listing) &&
            (model.availabilityFilter === 'All' ||
              listing._tag === 'Pending' ||
              listing.domain._tag === 'Available'),
        )
      } else {
        return Array.appendAll(
          Array.map(
            visibleDomains(
              domains,
              model.tldFilter,
              model.availabilityFilter,
              model.sortOrder,
            ),
            domainToListing,
          ),
          Array.filter(
            listings,
            listing =>
              listing._tag === 'Pending' &&
              matchesTldFilter(model.tldFilter)(listing),
          ),
        )
      }
    }),
    Match.tag('Failed', () => []),
    Match.exhaustive,
  )
