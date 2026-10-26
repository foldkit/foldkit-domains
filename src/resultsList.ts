import { Array, Schema } from 'effect'

import { VirtualList } from '@foldkit/ui'

import { DomainListing } from './domain'

const RESULTS_GROUP_SIZE = 6

export const ResultGroup = Schema.Struct({
  id: Schema.String,
  domains: Schema.Array(DomainListing),
})

export const groupResults = (
  domains: ReadonlyArray<typeof DomainListing.Type>,
): ReadonlyArray<typeof ResultGroup.Type> =>
  Array.map(Array.chunksOf(domains, RESULTS_GROUP_SIZE), domains =>
    ResultGroup.make({ id: Array.headNonEmpty(domains).name, domains }),
  )

export const RESULTS_LIST_ID = 'domain-results'
export const RESULTS_GROUP_HEIGHT_PX = 114
export const ResultsListBlock = VirtualList.create<typeof ResultGroup.Type>()
