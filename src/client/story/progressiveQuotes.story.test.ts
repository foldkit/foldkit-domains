import { Array, Option } from 'effect'
import { Command, given, message, model, steps, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { toParentMessage } from 'foldkit/test'
import { describe, expect, test } from 'vitest'

import { VirtualList } from '@foldkit/ui'

import { domainTlds } from '../../shared/domain'
import { makeDomainFixtures } from '../../shared/domain.fixture'
import { DetermineSearchTime, FocusSearchInput } from '../command'
import { ResultsListBinding } from '../composition'
import { Message } from '../message'
import { emptyModel, urlOrThrow, withQuotedWindow } from '../model.fixture'
import { QuoteFailure, QuoteWindows } from '../quoteWindows'
import { ResultsListBlock } from '../resultsList'
import { ApplicationRoute } from '../route'
import {
  QuoteRequestPresentation,
  SearchPresentation,
  searchPresentation,
} from '../searchPresentation'
import { update } from '../update'
import {
  quoteFetch,
  resolveQuoteFailure,
  resolveQuoteSuccess,
  resolveResultsListScrolls,
  resolveSearchTime,
} from './test'

const firstArgs = { label: 'acme', offset: 0, limit: 60 }
const secondArgs = { label: 'acme', offset: 60, limit: 60 }
const laterArgs = { label: 'acme', offset: 180, limit: 60 }
const catalogArgs = {
  label: 'acme',
  offset: 0,
  limit: domainTlds.length,
}
const allQuotes = makeDomainFixtures('acme')
const firstQuotes = Array.take(allQuotes, 60)
const secondQuotes = Array.take(Array.drop(allQuotes, 60), 60)
const laterQuotes = Array.take(Array.drop(allQuotes, 180), 60)
const partialModel = withQuotedWindow(
  modifyFields(emptyModel, {
    route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
    searchGeneration: () => 1,
  }),
  firstArgs,
  firstQuotes,
)
const pageFailure = QuoteFailure.make({
  error: 'Provider busy',
  maybeSearchCooldown: Option.none(),
})

const scroll = (scrollTop: number) =>
  toParentMessage(
    ResultsListBinding,
    ResultsListBlock.Message.ObservedContainerScroll({
      scrollTop,
      scrollHeight: 10_600,
      containerHeight: 400,
      anchor: VirtualList.ObservedAnchor.None(),
    }),
  )

const failPageAroundCriteriaChange = (
  criteriaMessage: Message,
  isBeforeFailure: boolean,
) =>
  isBeforeFailure
    ? steps(
        message(criteriaMessage),
        resolveQuoteFailure(secondArgs, 2, pageFailure, 20),
      )
    : steps(
        resolveQuoteFailure(secondArgs, 2, pageFailure, 20),
        message(criteriaMessage),
      )

describe('progressive quotes', () => {
  test('starts with 60 quotes and ignores a duplicate planning Clock while that window is pending', () => {
    story(
      update,
      given(emptyModel),
      message(
        Message.ChangedUrl({
          url: urlOrThrow('http://localhost/?q=acme'),
        }),
      ),
      resolveSearchTime(1, 0),
      Command.expectHas(quoteFetch(firstArgs, 1)),
      message(Message.RequestedQuotes({ offset: 0, limit: 60 })),
      resolveSearchTime(1, 1),
      Command.expectHas(quoteFetch(firstArgs, 1)),
      resolveQuoteSuccess(firstArgs, 1, firstQuotes, 10),
      model(model => {
        expect(searchPresentation(model)).toEqual(
          SearchPresentation.Ready({ domains: firstQuotes }),
        )
      }),
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })

  test('loads the latest viewport after the current page completes', () => {
    story(
      update,
      given(partialModel),
      message(scroll(1140)),
      resolveSearchTime(1, 10, 60, 60),
      Command.expectHas(quoteFetch(secondArgs, 2)),
      message(scroll(3762)),
      resolveQuoteSuccess(secondArgs, 2, secondQuotes, 20),
      Command.expectHas(
        DetermineSearchTime({
          searchGeneration: 1,
          offset: 180,
          limit: 60,
          isForced: false,
        }),
      ),
      resolveSearchTime(1, 30, 180, 60),
      Command.expectHas(quoteFetch(laterArgs, 3)),
      resolveQuoteSuccess(laterArgs, 3, laterQuotes, 40),
      model(model => {
        const presentation = searchPresentation(model)
        expect(presentation._tag).toBe('Ready')

        if (presentation._tag === 'Ready') {
          expect(presentation.domains).toHaveLength(180)
          expect(presentation.quoteRequest._tag).toBe('Idle')
        }
      }),
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })

  test('a later failure preserves checked quotes, retries only that page, and global sort loads the catalog', () => {
    story(
      update,
      given(partialModel),
      message(scroll(1140)),
      resolveSearchTime(1, 10, 60, 60),
      resolveQuoteFailure(secondArgs, 2, pageFailure, 20),
      model(model => {
        expect(searchPresentation(model)).toEqual(
          SearchPresentation.Ready({
            domains: firstQuotes,
            quoteRequest: QuoteRequestPresentation.Failed({
              offset: 60,
              limit: 60,
              error: 'Provider busy',
            }),
          }),
        )
      }),
      message(scroll(1140)),
      message(Message.ClickedRetrySearch()),
      Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
      resolveSearchTime(1, 30, 60, 60, true),
      Command.expectHas(quoteFetch(secondArgs, 3)),
      resolveQuoteSuccess(secondArgs, 3, secondQuotes, 40),
      message(Message.UpdatedSortOrder({ value: 'PriceAscending' })),
      resolveSearchTime(1, 50, 0, domainTlds.length),
      Command.expectHas(quoteFetch(catalogArgs, 4)),
      resolveQuoteSuccess(catalogArgs, 4, allQuotes, 60),
      model(model => {
        expect(model.sortOrder).toBe('PriceAscending')
        expect(searchPresentation(model)).toEqual(
          SearchPresentation.Ready({ domains: allQuotes }),
        )
      }),
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })

  test.each([
    {
      criteria: 'price sorting',
      timing: 'before the page failure',
      message: Message.UpdatedSortOrder({ value: 'PriceAscending' }),
      isBeforeFailure: true,
    },
    {
      criteria: 'price sorting',
      timing: 'after the page failure',
      message: Message.UpdatedSortOrder({ value: 'PriceAscending' }),
      isBeforeFailure: false,
    },
    {
      criteria: 'availability filtering',
      timing: 'before the page failure',
      message: Message.UpdatedAvailabilityFilter({ value: 'Available' }),
      isBeforeFailure: true,
    },
    {
      criteria: 'availability filtering',
      timing: 'after the page failure',
      message: Message.UpdatedAvailabilityFilter({ value: 'Available' }),
      isBeforeFailure: false,
    },
  ])(
    '$criteria changed $timing replaces the failed page with a complete catalog',
    ({ message: criteriaMessage, isBeforeFailure }) => {
      story(
        update,
        given(partialModel),
        message(scroll(1140)),
        resolveSearchTime(1, 10, 60, 60),
        failPageAroundCriteriaChange(criteriaMessage, isBeforeFailure),
        Command.expectHas(
          DetermineSearchTime({
            searchGeneration: 1,
            offset: 0,
            limit: domainTlds.length,
            isForced: false,
          }),
        ),
        resolveSearchTime(1, 30, 0, domainTlds.length),
        Command.expectHas(quoteFetch(catalogArgs, 3)),
        model(model => {
          expect(searchPresentation(model)).toEqual(
            SearchPresentation.Ready({
              domains: firstQuotes,
              quoteRequest: QuoteRequestPresentation.Loading({
                offset: 0,
                limit: domainTlds.length,
              }),
            }),
          )
          expect(model.quotePlan).toEqual([
            { offset: 0, limit: 60 },
            { offset: 60, limit: 60 },
            { offset: 0, limit: domainTlds.length },
          ])
        }),
        resolveQuoteSuccess(catalogArgs, 3, allQuotes, 40),
        model(model => {
          expect(model.quotePlan).toEqual([
            { offset: 0, limit: domainTlds.length },
          ])
          expect(QuoteWindows.read(model.quoteWindows, secondArgs)._tag).toBe(
            'Failure',
          )
          expect(searchPresentation(model)).toEqual(
            SearchPresentation.Ready({ domains: allQuotes }),
          )
        }),
        resolveResultsListScrolls,
        Command.expectNone(),
      )
    },
  )

  test('a failed complete catalog waits for explicit retry and retries that catalog', () => {
    story(
      update,
      given(partialModel),
      message(Message.UpdatedSortOrder({ value: 'PriceAscending' })),
      resolveSearchTime(1, 10, 0, domainTlds.length),
      resolveQuoteFailure(catalogArgs, 2, pageFailure, 20),
      model(model => {
        expect(searchPresentation(model)).toEqual(
          SearchPresentation.Ready({
            domains: firstQuotes,
            quoteRequest: QuoteRequestPresentation.Failed({
              offset: 0,
              limit: domainTlds.length,
              error: pageFailure.error,
            }),
          }),
        )
      }),
      message(scroll(1140)),
      resolveResultsListScrolls,
      Command.expectNone(),
      message(Message.ClickedRetrySearch()),
      Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
      resolveSearchTime(1, 30, 0, domainTlds.length, true),
      Command.expectHas(quoteFetch(catalogArgs, 3)),
      resolveQuoteSuccess(catalogArgs, 3, allQuotes, 40),
      model(model => {
        expect(model.quotePlan).toEqual([
          { offset: 0, limit: domainTlds.length },
        ])
        expect(searchPresentation(model)).toEqual(
          SearchPresentation.Ready({ domains: allQuotes }),
        )
      }),
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })
})
