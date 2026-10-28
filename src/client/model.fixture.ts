import { Array, Option, Result } from 'effect'
import { Url } from 'foldkit'
import { Command } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'

import { DialogBlock, VirtualList } from '@foldkit/ui'

import { Domain, domainTlds, queryToMaybeDomainLabel } from '../shared/domain'
import { makeDomainFixtures } from '../shared/domain.fixture'
import { CART_DIALOG_ID, FILTERS_DIALOG_ID } from './composition'
import { Model } from './model'
import { QuoteWindowArgs, QuoteWindows } from './quoteWindows'
import {
  RESULTS_GROUP_HEIGHT_PX,
  RESULTS_LIST_ID,
  ResultsListBlock,
} from './resultsList'
import { ApplicationRoute } from './route'

export const emptyModel = Model.make({
  route: ApplicationRoute.Search({ q: Option.none() }),
  searchGeneration: 0,
  searchTimeMillis: 0,
  quotePlan: [],
  quoteWindows: QuoteWindows.init().model,
  maybeBlockedQuoteWindow: Option.none(),
  maybeSearchCooldown: Option.none(),
  resultsList: ResultsListBlock.init({
    id: RESULTS_LIST_ID,
    rowHeightPx: RESULTS_GROUP_HEIGHT_PX,
    scrollContainer: VirtualList.ScrollContainer.Window(),
  }).model,
  tldFilter: 'All',
  availabilityFilter: 'All',
  sortOrder: 'Relevance',
  cart: [],
  cartDialog: DialogBlock.init({ id: CART_DIALOG_ID }).model,
  filtersDialog: DialogBlock.init({ id: FILTERS_DIALOG_ID }).model,
})

export const withQuotedWindow = (
  model: Model,
  args: QuoteWindowArgs,
  domains: ReadonlyArray<Domain>,
  completedAtMillis = 0,
): Model => {
  const windowLoad = QuoteWindows.requestRevalidationOrLoad(
    model.quoteWindows,
    args,
  )
  const fetchArgs = Option.getOrThrow(
    Array.findFirst(
      Array.getSomes(
        Array.map(
          windowLoad.commands ?? [],
          Command.argsOf(QuoteWindows.Fetch),
        ),
      ),
      () => true,
    ),
  )
  const windowCompletion = QuoteWindows.update(
    windowLoad.model,
    QuoteWindows.Message.CompletedFetch({
      ...fetchArgs,
      result: Result.succeed(domains),
      completedAtMillis,
    }),
  )

  return modifyFields(model, {
    quoteWindows: () => windowCompletion.model,
    searchTimeMillis: () => completedAtMillis,
    quotePlan: windows =>
      Array.some(
        windows,
        window => window.offset === args.offset && window.limit === args.limit,
      )
        ? windows
        : Array.append(windows, { offset: args.offset, limit: args.limit }),
  })
}

export const readyModel = (query: string): Model =>
  withQuotedWindow(
    modifyFields(emptyModel, {
      route: () => ApplicationRoute.Search({ q: Option.some(query) }),
      searchGeneration: () => 1,
    }),
    {
      label: Option.getOrThrow(queryToMaybeDomainLabel(query)),
      offset: 0,
      limit: domainTlds.length,
    },
    makeDomainFixtures(Option.getOrThrow(queryToMaybeDomainLabel(query))),
  )

export const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(
    Url.fromString(raw),
    () => new Error(`Failed to parse URL: ${raw}`),
  )
