import { Array, Schema, pipe } from 'effect'

import { VirtualList } from '@foldkit/ui'

import { DomainListing } from './domain'

const RESULTS_GROUP_SIZE = 6

export const DomainListingGroup = Schema.Struct({
  id: Schema.String,
  listings: Schema.Array(DomainListing),
})
export type DomainListingGroup = typeof DomainListingGroup.Type

export const groupDomainListings = (
  listings: ReadonlyArray<DomainListing>,
): ReadonlyArray<DomainListingGroup> =>
  pipe(
    listings,
    Array.chunksOf(RESULTS_GROUP_SIZE),
    Array.map(listings =>
      DomainListingGroup.make({
        id: Array.headNonEmpty(listings).name,
        listings,
      }),
    ),
  )

export const PageScrollKey = Schema.Literals([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
])
export type PageScrollKey = typeof PageScrollKey.Type

export const ResultsListScrollKey = Schema.Union([
  PageScrollKey,
  Schema.Literals(['End']),
])
export type ResultsListScrollKey = typeof ResultsListScrollKey.Type

export const RESULTS_LIST_ID = 'domain-results'
export const RESULTS_GROUP_HEIGHT_PX = 114
export const RESULTS_OVERSCAN_GROUPS = 2
export const ResultsListBlock = VirtualList.create<DomainListingGroup>()
