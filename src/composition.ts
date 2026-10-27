import { Block } from 'foldkit'

import { ApplicationDefinition, makeNoopStep } from './definition'
import {
  RESULTS_GROUP_HEIGHT_PX,
  RESULTS_LIST_ID,
  ResultsListBlock,
} from './resultsList'

const foldResultsListOutMessage = ApplicationDefinition.makeOutMessageFold(
  ResultsListBlock,
  {
    ObservedContainerScroll: makeNoopStep,
  },
)

export const ResultsListBinding = ApplicationDefinition.makeBinding(
  ResultsListBlock,
  {
    field: 'resultsList',
    init: {
      contextToArgs: () => [
        {
          id: RESULTS_LIST_ID,
          rowHeightPx: RESULTS_GROUP_HEIGHT_PX,
        },
      ],
    },
  },
).withOutMessagePolicy({ fold: foldResultsListOutMessage })

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [ResultsListBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
