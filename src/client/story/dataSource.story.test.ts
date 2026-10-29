import { Option, Result } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { toParentMessage } from 'foldkit/test'
import { expect, test } from 'vitest'

import { Dialog, DialogBlock } from '@foldkit/ui'

import { DataSource } from '../../shared/dataSource'
import { Domain } from '../../shared/domain'
import { FocusDataSourceButton } from '../command'
import {
  DataSourceBinding,
  DomainsQueryBinding,
  LiveWarningDialogBinding,
} from '../composition'
import { DataSourceControlBlock } from '../dataSourceControl'
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
  dataSource: 'Demo',
  label: 'acme',
  offset: 0,
  limit: 4,
})
const liveArgs = DomainsQueryArgs.make({ ...demoArgs, dataSource: 'Live' })
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
const requestDataSource = (dataSource: DataSource) =>
  message(
    toParentMessage(
      DataSourceBinding,
      DataSourceControlBlock.Message.SelectedItem({ item: dataSource }),
    ),
  )

const closeLiveWarning = [
  Command.resolve(
    Dialog.test.CloseDialog,
    DialogBlock.Message.CompletedCloseDialog(),
  ),
  Command.resolve(
    FocusDataSourceButton,
    Message.CompletedFocusDataSourceButton(),
  ),
]

const selectDataSource = (dataSource: DataSource) =>
  dataSource === 'Live'
    ? [
        requestDataSource(dataSource),
        Command.resolve(
          Dialog.test.ShowDialog,
          DialogBlock.Message.SucceededShowDialog(),
        ),
        message(Message.UpdatedLiveLatencyAcceptance({ isAccepted: true })),
        message(Message.ClickedContinueToLive()),
        ...closeLiveWarning,
      ]
    : [requestDataSource(dataSource)]

test('switching data sources cancels a pending lookup and rejects its late quotes and cooldown', () => {
  story(
    update,
    given(searchModel),
    message(
      Message.CompletedReadSearchPlanningTime({
        searchGeneration: 0,
        offset: 0,
        limit: 4,
        isRefreshRequested: false,
        nowMillis: 0,
      }),
    ),
    Command.expectHas(makeDomainsFetch(demoArgs, 1)),
    ...selectDataSource('Live'),
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
              error: 'Old data source failed',
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
      expect(model.dataSource).toBe('Live')
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

test('data-source-specific cached results and carts restore without fetching or changing the query', () => {
  const cachedModel = withDomainsForRange(
    withDomainsForRange(searchModel, demoArgs, [demoDomain]),
    liveArgs,
    [liveDomain],
  )
  story(
    update,
    given(cachedModel),
    message(Message.ClickedAddDomain({ domain: demoDomain })),
    ...selectDataSource('Live'),
    resolveSearchTime(1, 100),
    model(model => {
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({ domains: [liveDomain] }),
      )
      expect(activeCart(model)).toEqual([])
    }),
    message(Message.ClickedAddDomain({ domain: liveDomain })),
    ...selectDataSource('Demo'),
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
        dataSource: () => 'Live',
        maybeSearchCooldown: () => Option.some(cooldown),
      }),
    ),
    ...selectDataSource('Demo'),
    resolveSearchTime(1, 100),
    Command.expectHas(makeDomainsFetch(demoArgs, 1)),
    resolveDomainsSuccess(demoArgs, 1, [demoDomain], 200),
    ...selectDataSource('Live'),
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

test('Live requires acknowledgment and cancellation leaves Demo active with fresh consent on reopening', () => {
  story(
    update,
    given(searchModel),
    requestDataSource('Live'),
    Command.resolve(
      Dialog.test.ShowDialog,
      DialogBlock.Message.SucceededShowDialog(),
    ),
    message(Message.ClickedContinueToLive()),
    model(model => {
      expect(model.dataSource).toBe('Demo')
      expect(model.liveWarningDialog.isOpen).toBe(true)
      expect(model.isLiveLatencyAccepted).toBe(false)
      expect(model.searchGeneration).toBe(0)
    }),
    message(Message.UpdatedLiveLatencyAcceptance({ isAccepted: true })),
    message(
      toParentMessage(
        LiveWarningDialogBinding,
        DialogBlock.Message.RequestedClose(),
      ),
    ),
    ...closeLiveWarning,
    model(model => {
      expect(model.dataSource).toBe('Demo')
      expect(model.liveWarningDialog.isOpen).toBe(false)
      expect(model.isLiveLatencyAccepted).toBe(false)
    }),
    message(Message.ClickedContinueToLive()),
    requestDataSource('Live'),
    Command.resolve(
      Dialog.test.ShowDialog,
      DialogBlock.Message.SucceededShowDialog(),
    ),
    model(model => {
      expect(model.isLiveLatencyAccepted).toBe(false)
      expect(model.dataSource).toBe('Demo')
      expect(DomainsQuery.pendingArgs(model.domainsQuery)).toEqual([])
    }),
    Command.expectNone(),
  )
})
