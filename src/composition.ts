import { Block } from 'foldkit'

import { DialogBlock, VirtualList } from '@foldkit/ui'

import { FocusCartButton } from './command'
import {
  makeBinding,
  makeCommandsStep,
  makeComposition,
  makeNoopStep,
  makeOutMessageFold,
} from './definition'
import { loadVisibleQuotesStep } from './quoteLoading'
import {
  RESULTS_GROUP_HEIGHT_PX,
  RESULTS_LIST_ID,
  ResultsListBlock,
} from './resultsList'

export const ResultsListBinding = makeBinding(ResultsListBlock, {
  field: 'resultsList',
  init: {
    contextToArgs: () => [
      {
        id: RESULTS_LIST_ID,
        rowHeightPx: RESULTS_GROUP_HEIGHT_PX,
        scrollContainer: VirtualList.ScrollContainer.Window(),
      },
    ],
  },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(ResultsListBlock, {
    ObservedContainerScroll: () => loadVisibleQuotesStep,
    ApproachedLoadedStart: makeNoopStep,
    EndedContainerScroll: () => loadVisibleQuotesStep,
  }),
})

export const CART_DIALOG_ID = 'domains-cart'

export const CartDialogBinding = makeBinding(DialogBlock, {
  field: 'cartDialog',
  init: { contextToArgs: () => [{ id: CART_DIALOG_ID }] },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(DialogBlock, {
    Opened: makeNoopStep,
    Closed: makeNoopStep,
    CompletedClose: () => makeCommandsStep(() => [FocusCartButton()]),
  }),
})

export const ApplicationComposition = makeComposition({
  bindings: [ResultsListBinding, CartDialogBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
