import { Update } from 'foldkit'

import { makeFieldsStep } from '../definition'
import { AvailabilityFilter, SortOrder, TldFilter } from '../domain'
import { loadRequiredQuotesStep } from './quoteLoading'
import { informResultsListStep } from './resultsList'

export const makeChangeTldFilterStep = (value: TldFilter) =>
  Update.combineSteps([
    makeFieldsStep(() => ({ tldFilter: () => value })),
    loadRequiredQuotesStep,
    informResultsListStep,
  ])

export const makeChangeAvailabilityFilterStep = (value: AvailabilityFilter) =>
  Update.combineSteps([
    makeFieldsStep(() => ({ availabilityFilter: () => value })),
    loadRequiredQuotesStep,
    informResultsListStep,
  ])

export const makeChangeSortOrderStep = (value: SortOrder) =>
  Update.combineSteps([
    makeFieldsStep(() => ({ sortOrder: () => value })),
    loadRequiredQuotesStep,
    informResultsListStep,
  ])
