import { expect, test } from 'vitest'

import { searchDomains } from './domain'
import { Message } from './message'
import { Model, SearchState } from './model'
import { update } from './update'

const emptyModel = Model.make({
  query: '',
  revision: 0,
  search: SearchState.Idle(),
  tld: 'All',
  availability: 'All',
  sorting: 'Relevance',
  cart: [],
  cartVisibility: 'Closed',
})

test('only the current search can supply results, even when a query is repeated', () => {
  const initialSearch = update(
    emptyModel,
    Message.UpdatedSearch({ value: 'acme' }),
  )
  const otherSearch = update(
    initialSearch.model,
    Message.UpdatedSearch({ value: 'other' }),
  )
  const repeatedSearch = update(
    otherSearch.model,
    Message.UpdatedSearch({ value: 'acme' }),
  )
  const outdatedSuccess = update(
    repeatedSearch.model,
    Message.SucceededFetchDomains({
      revision: 1,
      domains: searchDomains('acme'),
    }),
  )
  const outdatedFailure = update(
    outdatedSuccess.model,
    Message.FailedFetchDomains({ revision: 2, error: 'Search unavailable' }),
  )

  expect(outdatedFailure.model.query).toBe('acme')
  expect(outdatedFailure.model.search._tag).toBe('Loading')

  const currentSearch = update(
    outdatedFailure.model,
    Message.SucceededFetchDomains({
      revision: 3,
      domains: searchDomains('acme'),
    }),
  )
  expect(currentSearch.model.search).toEqual(
    SearchState.Ready({ domains: searchDomains('acme') }),
  )
})

test('clearing the input prevents an in-flight search from reopening results', () => {
  const initialSearch = update(
    emptyModel,
    Message.UpdatedSearch({ value: 'acme' }),
  )
  const searchClear = update(initialSearch.model, Message.ClickedClearSearch())
  const outdatedSearch = update(
    searchClear.model,
    Message.SucceededFetchDomains({
      revision: 1,
      domains: searchDomains('acme'),
    }),
  )

  expect(outdatedSearch.model.query).toBe('')
  expect(outdatedSearch.model.search._tag).toBe('Idle')
})
