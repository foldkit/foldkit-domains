import { Option, Result } from 'effect'
import { Block, Update } from 'foldkit'

import { DialogBlock, VirtualList } from '@foldkit/ui'

import { domainTlds, queryToMaybeDomainLabel } from '../shared/domain'
import { FocusCartButton, FocusFiltersButton } from './command'
import {
  makeBinding,
  makeCommandsStep,
  makeComposition,
  makeFieldsStep,
  makeNoopStep,
  makeOutMessageFold,
  makeStep,
} from './definition'
import { QuoteWindows } from './quoteWindows'
import {
  RESULTS_GROUP_HEIGHT_PX,
  RESULTS_LIST_ID,
  ResultsListBlock,
} from './resultsList'
import { routeToQuery } from './route'
import { loadRequiredQuotesStep } from './steps/quoteLoading'
import { informResultsListStep } from './steps/resultsList'

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
    ObservedContainerScroll: () => loadRequiredQuotesStep,
    ApproachedLoadedStart: makeNoopStep,
    EndedContainerScroll: () => loadRequiredQuotesStep,
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

export const FILTERS_DIALOG_ID = 'domains-filters'

export const FiltersDialogBinding = makeBinding(DialogBlock, {
  field: 'filtersDialog',
  init: { contextToArgs: () => [{ id: FILTERS_DIALOG_ID }] },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(DialogBlock, {
    Opened: makeNoopStep,
    Closed: makeNoopStep,
    CompletedClose: () => makeCommandsStep(() => [FocusFiltersButton()]),
  }),
})

export const QuoteWindowsBinding = makeBinding(QuoteWindows, {
  field: 'quoteWindows',
}).withOutMessagePolicy({
  fold: makeOutMessageFold(QuoteWindows, {
    CompletedFetch: ({ args, result, completedAtMillis }) =>
      makeStep(model => {
        if (
          !Option.contains(
            queryToMaybeDomainLabel(routeToQuery(model.route)),
            args.label,
          )
        ) {
          return { model }
        }

        return Update.combineSteps([
          makeFieldsStep(() => ({
            searchTimeMillis: time => completedAtMillis ?? time,
            quotePlan: windows =>
              Result.isSuccess(result) &&
              args.offset === 0 &&
              args.limit === domainTlds.length
                ? [{ offset: args.offset, limit: args.limit }]
                : windows,
            maybeSearchCooldown: maybeCooldown =>
              Result.isFailure(result)
                ? Option.orElse(
                    result.failure.maybeSearchCooldown,
                    () => maybeCooldown,
                  )
                : maybeCooldown,
          })),
          loadRequiredQuotesStep,
          informResultsListStep,
        ])
      }),
  }),
})

export const ApplicationComposition = makeComposition({
  bindings: [
    ResultsListBinding,
    CartDialogBinding,
    FiltersDialogBinding,
    QuoteWindowsBinding,
  ],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
