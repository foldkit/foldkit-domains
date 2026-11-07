import { Array, pipe } from 'effect'
import { initAndSet } from 'foldkit/binding'

import { makeStep } from '../block'
import { ResultsListBinding } from '../composition'
import { resultListings } from '../resultListings'
import { groupDomainListings, resultsListConfig } from '../resultsList'

export const informResultsList = makeStep(model =>
  ResultsListBinding.informOfItemsChanged(
    pipe(
      model,
      resultListings,
      groupDomainListings,
      Array.map(row => row.id),
    ),
  ),
)

export const resetResultsList = makeStep(model =>
  initAndSet(ResultsListBinding, model, { args: [resultsListConfig] }),
)
