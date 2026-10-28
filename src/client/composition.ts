import { Option, Result } from 'effect'
import { Block, Update } from 'foldkit'

import { DialogBlock } from '@foldkit/ui'

import { queryToMaybeDomainLabel } from '../shared/domain'
import {
  FocusCartButton,
  FocusFiltersButton,
  FocusTldFilterButton,
} from './command'
import {
  makeBinding,
  makeCommandsStep,
  makeComposition,
  makeFieldsStep,
  makeNoopStep,
  makeOutMessageFold,
  makeStep,
} from './definition'
import { DomainsQuery } from './domainsQuery'
import {
  AVAILABILITY_FILTER_ID,
  AvailabilityListboxBlock,
  SORT_ORDER_ID,
  SortListboxBlock,
  TLD_FILTER_ID,
  TldListboxBlock,
} from './filterListboxes'
import { ResultsListBlock, resultsListConfig } from './resultsList'
import { routeToQuery } from './route'
import {
  SEARCH_MODE_CONTROL_ID,
  SearchModeControlBlock,
} from './searchModeControl'
import {
  makeChangeAvailabilityFilterStep,
  makeChangeSortOrderStep,
  makeChangeTldFilterStep,
} from './steps/filters'
import {
  loadRequiredQuotesStep,
  makeUseCompleteCatalogRangeStep,
} from './steps/quoteLoading'
import { informResultsListStep } from './steps/resultsList'
import { makeChangeSearchModeStep } from './steps/search'

export const ResultsListBinding = makeBinding(ResultsListBlock, {
  field: 'resultsList',
  init: {
    contextToArgs: () => [resultsListConfig],
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
  init: { contextToArgs: () => [{ id: FILTERS_DIALOG_ID, isAnimated: true }] },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(DialogBlock, {
    Opened: makeNoopStep,
    Closed: makeNoopStep,
    CompletedClose: () => makeCommandsStep(() => [FocusFiltersButton()]),
  }),
})

export const TLD_DIALOG_ID = 'domains-tld-filter'

export const TldDialogBinding = makeBinding(DialogBlock, {
  field: 'tldDialog',
  init: { contextToArgs: () => [{ id: TLD_DIALOG_ID, isAnimated: true }] },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(DialogBlock, {
    Opened: makeNoopStep,
    Closed: makeNoopStep,
    CompletedClose: () => makeCommandsStep(() => [FocusTldFilterButton()]),
  }),
})

export const SearchModeBinding = makeBinding(SearchModeControlBlock, {
  field: 'searchModeControl',
  init: { contextToArgs: () => [{ id: SEARCH_MODE_CONTROL_ID }] },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(SearchModeControlBlock, {
    Selected: ({ value }) => makeChangeSearchModeStep(value),
  }),
})

export const DomainsQueryBinding = makeBinding(DomainsQuery, {
  field: 'domainsQuery',
}).withOutMessagePolicy({
  fold: makeOutMessageFold(DomainsQuery, {
    CompletedFetch: ({ args, result, completedAtMillis }) =>
      makeStep(model => {
        if (
          args.mode !== model.searchMode ||
          !Option.contains(
            queryToMaybeDomainLabel(routeToQuery(model.route)),
            args.label,
          )
        ) {
          return { model }
        }

        return Update.combineSteps([
          makeFieldsStep(() => ({
            searchPlanningTimeMillis: time => completedAtMillis ?? time,
            maybeSearchCooldown: maybeCooldown =>
              model.searchMode === 'Live' && Result.isFailure(result)
                ? Option.orElse(
                    result.failure.maybeSearchCooldown,
                    () => maybeCooldown,
                  )
                : maybeCooldown,
          })),
          Result.isSuccess(result)
            ? makeUseCompleteCatalogRangeStep(args)
            : makeNoopStep(),
          loadRequiredQuotesStep,
          informResultsListStep,
        ])
      }),
  }),
})

const foldTldListboxOutMessage = makeOutMessageFold(TldListboxBlock, {
  Selected: ({ value }) => makeChangeTldFilterStep(value),
})

export const TldListboxBinding = makeBinding(TldListboxBlock, {
  field: 'tldListbox',
  init: { contextToArgs: () => [{ id: TLD_FILTER_ID }] },
}).withOutMessagePolicy({ fold: foldTldListboxOutMessage })

const foldAvailabilityListboxOutMessage = makeOutMessageFold(
  AvailabilityListboxBlock,
  {
    Selected: ({ value }) => makeChangeAvailabilityFilterStep(value),
  },
)

export const AvailabilityListboxBinding = makeBinding(
  AvailabilityListboxBlock,
  {
    field: 'availabilityListbox',
    init: { contextToArgs: () => [{ id: AVAILABILITY_FILTER_ID }] },
  },
).withOutMessagePolicy({ fold: foldAvailabilityListboxOutMessage })

const foldSortListboxOutMessage = makeOutMessageFold(SortListboxBlock, {
  Selected: ({ value }) => makeChangeSortOrderStep(value),
})

export const SortListboxBinding = makeBinding(SortListboxBlock, {
  field: 'sortListbox',
  init: { contextToArgs: () => [{ id: SORT_ORDER_ID }] },
}).withOutMessagePolicy({ fold: foldSortListboxOutMessage })

export const ApplicationComposition = makeComposition({
  bindings: [
    SearchModeBinding,
    ResultsListBinding,
    CartDialogBinding,
    FiltersDialogBinding,
    TldDialogBinding,
    DomainsQueryBinding,
    TldListboxBinding,
    AvailabilityListboxBinding,
    SortListboxBinding,
  ],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
