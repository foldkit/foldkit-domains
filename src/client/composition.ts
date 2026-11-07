import { Block } from 'foldkit'

import { DialogBlock } from '@foldkit/ui'

import {
  makeCommandsStep,
  makeComposition,
  makeNoopStep,
  makeOutMessageFold,
  makeRequiredFieldBinding,
} from './block'
import {
  FocusCartButton,
  FocusFiltersButton,
  FocusTldFilterButton,
} from './command'
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
  continueSearchAfterDomainRequest,
  requestNextDomainRange,
} from './steps/domainRequests'
import {
  updateAvailabilityFilter,
  updateSortOrder,
  updateTldFilter,
} from './steps/filters'

export const ResultsListBinding = makeRequiredFieldBinding(ResultsListBlock, {
  field: 'resultsList',
  init: {
    contextToArgs: () => [resultsListConfig],
  },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(ResultsListBlock, {
    ObservedContainerScroll: () => requestNextDomainRange,
    ApproachedLoadedStart: makeNoopStep,
    EndedContainerScroll: makeNoopStep,
  }),
})

export const CART_DIALOG_ID = 'domains-cart'

export const CartDialogBinding = makeRequiredFieldBinding(DialogBlock, {
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

export const FiltersDialogBinding = makeRequiredFieldBinding(DialogBlock, {
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

export const TldDialogBinding = makeRequiredFieldBinding(DialogBlock, {
  field: 'tldDialog',
  init: { contextToArgs: () => [{ id: TLD_DIALOG_ID, isAnimated: true }] },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(DialogBlock, {
    Opened: makeNoopStep,
    Closed: makeNoopStep,
    CompletedClose: () => makeCommandsStep(() => [FocusTldFilterButton()]),
  }),
})

export const DomainsQueryBinding = makeRequiredFieldBinding(DomainsQuery, {
  field: 'domainsQuery',
}).withOutMessagePolicy({
  fold: makeOutMessageFold(DomainsQuery, {
    CompletedFetch: continueSearchAfterDomainRequest,
  }),
})

export const TldListboxBinding = makeRequiredFieldBinding(TldListboxBlock, {
  field: 'tldListbox',
  init: { contextToArgs: () => [{ id: TLD_FILTER_ID }] },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(TldListboxBlock, {
    Selected: ({ value }) => updateTldFilter(value),
  }),
})

export const AvailabilityListboxBinding = makeRequiredFieldBinding(
  AvailabilityListboxBlock,
  {
    field: 'availabilityListbox',
    init: { contextToArgs: () => [{ id: AVAILABILITY_FILTER_ID }] },
  },
).withOutMessagePolicy({
  fold: makeOutMessageFold(AvailabilityListboxBlock, {
    Selected: ({ value }) => updateAvailabilityFilter(value),
  }),
})

export const SortListboxBinding = makeRequiredFieldBinding(SortListboxBlock, {
  field: 'sortListbox',
  init: { contextToArgs: () => [{ id: SORT_ORDER_ID }] },
}).withOutMessagePolicy({
  fold: makeOutMessageFold(SortListboxBlock, {
    Selected: ({ value }) => updateSortOrder(value),
  }),
})

export const ApplicationComposition = makeComposition({
  bindings: [
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
