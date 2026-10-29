import { Option, Result } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { toParentMessage } from 'foldkit/test'
import { expect, test } from 'vitest'

import { Domain } from '../../shared/domain'
import { SearchMode } from '../../shared/searchMode'
import { DomainsQueryBinding, SearchModeBinding } from '../composition'
import {
  DomainsQuery,
  DomainsQueryArgs,
  DomainsQueryFailure,
} from '../domainsQuery'
import { Message } from '../message'
import { activeCart } from '../model'
import { emptyModel, withDomainsForRange } from '../model.fixture'
import { ApplicationRoute, routeToQuery } from '../route'
import { SearchCooldown } from '../searchCooldown'
import { SearchModeControlBlock } from '../searchModeControl'
import { SearchPresentation, searchPresentation } from '../searchPresentation'
import { update } from '../update'
import {
  domainsRequestKey,
  makeDomainsFetch,
  resolveDomainsCancellation,
  resolveDomainsSuccess,
  resolveResultsListScrolls,
  resolveSearchTime,
} from './test'

const demoArgs = DomainsQueryArgs.make({
  mode: 'Demo',
  label: 'acme',
  offset: 0,
  limit: 4,
})
const liveArgs = DomainsQueryArgs.make({ ...demoArgs, mode: 'Live' })
const demoDomain = Domain.Available({
  name: 'acme.com',
  tld: 'com',
  price: 12,
  renewalPrice: 12,
  years: 1,
  isPremium: false,
})
const liveDomain = Domain.Available({
  ...demoDomain,
  price: 25,
  renewalPrice: 25,
})
const searchModel = modifyFields(emptyModel, {
  route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
  tldFilter: () => 'Com',
})
const selectMode = (mode: SearchMode) =>
  message(
    toParentMessage(
      SearchModeBinding,
      SearchModeControlBlock.Message.SelectedItem({ item: mode }),
    ),
  )

test('switching modes cancels a pending lookup and rejects its late quotes and cooldown', () => {
  story(
    update,
    given(searchModel),
    message(
      Message.CompletedReadSearchPlanningTime({
        searchGeneration: 0,
        offset: 0,
        limit: 4,
        isForced: false,
        nowMillis: 0,
      }),
    ),
    Command.expectHas(makeDomainsFetch(demoArgs, 1)),
    selectMode('Live'),
    resolveDomainsCancellation(demoArgs, 1),
    resolveSearchTime(1, 100),
    Command.expectHas(makeDomainsFetch(liveArgs, 3)),
    message(
      toParentMessage(
        DomainsQueryBinding,
        DomainsQuery.Message.CompletedFetch({
          args: demoArgs,
          generation: 1,
          requestKey: domainsRequestKey(demoArgs),
          completedAtMillis: 200,
          result: Result.fail(
            DomainsQueryFailure.make({
              error: 'Old mode failed',
              maybeSearchCooldown: Option.some(
                SearchCooldown.make({
                  source: 'Registrar',
                  expiresAtMillis: 10000,
                }),
              ),
            }),
          ),
        }),
      ),
    ),
    model(model => {
      expect(model.searchMode).toBe('Live')
      expect(routeToQuery(model.route)).toBe('acme')
      expect(model.maybeSearchCooldown).toEqual(Option.none())
      expect(searchPresentation(model)).toEqual(SearchPresentation.Loading())
      expect(DomainsQuery.pendingArgs(model.domainsQuery)).toEqual([liveArgs])
    }),
    resolveDomainsSuccess(liveArgs, 3, [liveDomain], 300),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('mode-specific cached quotes and carts restore without fetching or changing the query', () => {
  const cachedModel = withDomainsForRange(
    withDomainsForRange(searchModel, demoArgs, [demoDomain]),
    liveArgs,
    [liveDomain],
  )
  story(
    update,
    given(cachedModel),
    message(Message.ClickedAddDomain({ domain: demoDomain })),
    selectMode('Live'),
    resolveSearchTime(1, 100),
    model(model => {
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({ domains: [liveDomain] }),
      )
      expect(activeCart(model)).toEqual([])
    }),
    message(Message.ClickedAddDomain({ domain: liveDomain })),
    selectMode('Demo'),
    resolveSearchTime(2, 200),
    model(model => {
      expect(routeToQuery(model.route)).toBe('acme')
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({ domains: [demoDomain] }),
      )
      expect(activeCart(model)).toEqual([demoDomain])
      expect(model.carts.Live).toEqual([liveDomain])
      expect(DomainsQuery.pendingArgs(model.domainsQuery)).toEqual([])
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('a live provider cooldown permits Demo requests and applies again after returning to Live', () => {
  const cooldown = SearchCooldown.make({
    source: 'Registrar',
    expiresAtMillis: 10000,
  })
  story(
    update,
    given(
      modifyFields(searchModel, {
        searchMode: () => 'Live',
        maybeSearchCooldown: () => Option.some(cooldown),
      }),
    ),
    selectMode('Demo'),
    resolveSearchTime(1, 100),
    Command.expectHas(makeDomainsFetch(demoArgs, 1)),
    resolveDomainsSuccess(demoArgs, 1, [demoDomain], 200),
    selectMode('Live'),
    resolveSearchTime(2, 300),
    model(model => {
      expect(model.maybeSearchCooldown).toEqual(Option.some(cooldown))
      expect(searchPresentation(model)._tag).toBe('Failed')
      expect(DomainsQuery.pendingArgs(model.domainsQuery)).toEqual([])
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})
