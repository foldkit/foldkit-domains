import { Block } from 'foldkit'

import { DialogBlock } from '@foldkit/ui'

import {
  FocusCartButton,
  FocusDataSourceButton,
  FocusFiltersButton,
  FocusTldFilterButton,
} from './command'
import {
  DATA_SOURCE_CONTROL_ID,
  DataSourceControlBlock,
} from './dataSourceControl'
import {
  makeBinding,
  makeCommandsStep,
  makeComposition,
  makeFieldsStep,
  makeNoopStep,
  makeOutMessageFold,
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
import {
  loadRequiredDomainsStep,
  makeApplyDomainCompletionStep,
} from './steps/domainLoading'
import {
  makeChangeAvailabilityFilterStep,
  makeChangeSortOrderStep,
  makeChangeTldFilterStep,
} from './steps/filters'
import { makeRequestDataSourceStep } from './steps/search'

export const ResultsListBinding = makeBinding(ResultsListBlock, {
  field: 'resultsList',
  init: {
    contextToArgs: () => [resultsListConfig],
  },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(ResultsListBlock, {
    ObservedContainerScroll: () => loadRequiredDomainsStep,
    ApproachedLoadedStart: makeNoopStep,
    EndedContainerScroll: () => loadRequiredDomainsStep,
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

export const LIVE_WARNING_DIALOG_ID = 'domains-live-warning'

export const LiveWarningDialogBinding = makeBinding(DialogBlock, {
  field: 'liveWarningDialog',
  init: { contextToArgs: () => [{ id: LIVE_WARNING_DIALOG_ID }] },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(DialogBlock, {
    Opened: makeNoopStep,
    Closed: () =>
      makeFieldsStep(() => ({ isLiveLatencyAccepted: () => false })),
    CompletedClose: () => makeCommandsStep(() => [FocusDataSourceButton()]),
  }),
})

export const DataSourceBinding = makeBinding(DataSourceControlBlock, {
  field: 'dataSourceControl',
  init: {
    contextToArgs: () => [{ id: DATA_SOURCE_CONTROL_ID, isAnimated: true }],
  },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(DataSourceControlBlock, {
    Selected: ({ value }) => makeRequestDataSourceStep(value),
  }),
})

export const DomainsQueryBinding = makeBinding(DomainsQuery, {
  field: 'domainsQuery',
}).withOutMessagePolicy({
  fold: makeOutMessageFold(DomainsQuery, {
    CompletedFetch: makeApplyDomainCompletionStep,
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
    DataSourceBinding,
    LiveWarningDialogBinding,
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
