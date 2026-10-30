import { Update } from 'foldkit'

import { makeFieldsStep } from '../definition'
import { AvailabilityFilter, SortOrder, TldFilter } from '../domain'
import { loadRequiredDomainsStep } from './domainLoading'
import { informResultsListStep } from './resultsList'

export const changeTldFilterStep = (value: TldFilter) =>
  Update.combineSteps([
    makeFieldsStep(() => ({ tldFilter: () => value })),
    loadRequiredDomainsStep,
    informResultsListStep,
  ])

export const changeAvailabilityFilterStep = (value: AvailabilityFilter) =>
  Update.combineSteps([
    makeFieldsStep(() => ({ availabilityFilter: () => value })),
    loadRequiredDomainsStep,
    informResultsListStep,
  ])

export const changeSortOrderStep = (value: SortOrder) =>
  Update.combineSteps([
    makeFieldsStep(() => ({ sortOrder: () => value })),
    loadRequiredDomainsStep,
    informResultsListStep,
  ])
