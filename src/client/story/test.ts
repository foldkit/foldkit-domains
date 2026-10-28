import { Array, Option, Result, String } from 'effect'
import { Command, type StorySimulation, message, steps } from 'foldkit/story'

import { VirtualList } from '@foldkit/ui'

import { Domain } from '../../shared/domain'
import { DetermineSearchTime, ReplaceSearchUrl } from '../command'
import { Message } from '../message'
import { urlOrThrow } from '../model.fixture'
import { QuoteFailure, QuoteWindowArgs, QuoteWindows } from '../quoteWindows'
import { ResultsListBlock } from '../resultsList'
import { searchHref } from '../route'

export const quoteRequestKey = (args: QuoteWindowArgs) => {
  const request = QuoteWindows.requestRevalidationOrLoad(
    QuoteWindows.init().model,
    args,
  )

  return Option.getOrThrow(
    Array.head(
      Array.getSomes(
        Array.map(request.commands ?? [], Command.argsOf(QuoteWindows.Fetch)),
      ),
    ),
  ).requestKey
}

export const quoteFetch = (args: QuoteWindowArgs, generation: number) =>
  QuoteWindows.Fetch({
    args,
    generation,
    requestKey: quoteRequestKey(args),
  })

export const resolveSearchTime = (
  searchGeneration: number,
  nowMillis: number,
  offset = 0,
  limit = 60,
  isForced = false,
) =>
  Command.resolve(
    DetermineSearchTime({ searchGeneration, offset, limit, isForced }),
    Message.CompletedDetermineSearchTime({
      searchGeneration,
      nowMillis,
      offset,
      limit,
      isForced,
    }),
  )

export const changeSearchQuery = (
  query: string,
  searchGeneration: number,
  nowMillis: number,
) =>
  steps(
    message(Message.UpdatedSearch({ value: query })),
    Command.resolve(
      ReplaceSearchUrl({
        q: Option.liftPredicate(query, String.isNonEmpty),
      }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(
      Message.ChangedUrl({
        url: urlOrThrow(`http://localhost${searchHref(query)}`),
      }),
    ),
    resolveSearchTime(searchGeneration, nowMillis),
  )

export const resolveQuoteSuccess = (
  args: QuoteWindowArgs,
  generation: number,
  domains: ReadonlyArray<Domain>,
  completedAtMillis = 0,
) =>
  Command.resolve(
    quoteFetch(args, generation),
    QuoteWindows.Message.CompletedFetch({
      args,
      generation,
      requestKey: quoteRequestKey(args),
      result: Result.succeed(domains),
      completedAtMillis,
    }),
  )

export const resolveQuoteFailure = (
  args: QuoteWindowArgs,
  generation: number,
  failure: QuoteFailure,
  completedAtMillis = 0,
) =>
  Command.resolve(
    quoteFetch(args, generation),
    QuoteWindows.Message.CompletedFetch({
      args,
      generation,
      requestKey: quoteRequestKey(args),
      result: Result.fail(failure),
      completedAtMillis,
    }),
  )

export const resolveQuoteCancellation = (
  args: QuoteWindowArgs,
  generation: number,
) =>
  Command.resolve(
    QuoteWindows.Fetch.Interrupt(
      { requestKey: quoteRequestKey(args), generation },
      () => QuoteWindows.Message.CompletedCancelFetch(),
    ),
    QuoteWindows.Message.CompletedCancelFetch(),
  )

export const resolveResultsListScrolls = <Model, Message, OutMessage>(
  simulation: StorySimulation<Model, Message, OutMessage>,
): StorySimulation<Model, Message, OutMessage> =>
  Array.reduce(simulation.commands, simulation, (current, command) =>
    Option.match(Command.argsOf(VirtualList.test.ApplyScroll)(command), {
      onNone: () => current,
      onSome: args =>
        Command.resolve(
          VirtualList.test.ApplyScroll(args),
          ResultsListBlock.Message.CompletedApplyScroll({
            version: args.version,
            outcome: VirtualList.ApplyScrollOutcome.Skipped(),
          }),
        )(current),
    }),
  )
