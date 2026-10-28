import { Array, pipe } from 'effect'
import { initAndSet } from 'foldkit/bindingInit'

import { ResultsListBinding } from '../composition'
import { makeStep } from '../definition'
import { groupDomainListings, resultsListConfig } from '../resultsList'
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

export const resetResultsListStep = makeStep(model =>
  initAndSet(ResultsListBinding, model, { args: [resultsListConfig] }),
)
