import { Array, pipe } from 'effect'

import { ResultsListBinding } from '../composition'
import { makeStep } from '../definition'
import { groupDomainListings } from '../resultsList'
import { visibleResultListings } from '../visibleResultListings'

export const informResultsListStep = makeStep(model =>
  ResultsListBinding.informItemsChanged(
    pipe(
      model,
      visibleResultListings,
      groupDomainListings,
      Array.map(row => row.id),
    ),
  ),
)
