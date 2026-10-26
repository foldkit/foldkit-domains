import { Tuple } from 'effect'
import { Block } from 'foldkit'

import {
  makeBinding,
  makeComposition,
  makeNoopStep,
  makeOutMessageFold,
} from './definition'
import {
  RESULTS_GROUP_HEIGHT_PX,
  RESULTS_LIST_ID,
  ResultsListBlock,
} from './resultsList'

const foldResultsListOutMessage = makeOutMessageFold(ResultsListBlock, {
  ObservedContainerScroll: makeNoopStep,
})

export const ResultsListBinding = makeBinding(ResultsListBlock, {
  field: 'resultsList',
  init: {
    contextToArgs: () =>
      Tuple.make({ id: RESULTS_LIST_ID, rowHeightPx: RESULTS_GROUP_HEIGHT_PX }),
  },
}).withOutMessagePolicy({ fold: foldResultsListOutMessage })

export const ApplicationComposition = makeComposition({
  bindings: [ResultsListBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
