import { Array } from 'effect'
import { Story } from 'foldkit'
import { describe, expect } from 'vitest'

import { it } from '@effect/vitest'

import { makeDomainFixtures } from '../shared/domain.fixture'
import { ApplicationBlock } from './block'
import { ReadCurrentTime, ReleaseEarlySearchListeners } from './command'
import { layer } from './layer'
import { Message } from './message'
import { urlOrThrow } from './model.fixture'
import { routeToQuery } from './route'
import { searchViewState } from './searchViewState'
import {
  resolveDomainsSuccess,
  resolveRemainingFirstPageDomains,
  resolveResultsListScrolls,
  resolveSearchTime,
} from './story/test'

describe('startup', () => {
  it.effect.each([
    { path: '/', query: '', viewStateTag: 'Idle', clocks: [] },
    {
      path: '/?q=Acme.dev',
      query: 'Acme.dev',
      viewStateTag: 'Loading',
      clocks: [
        { searchGeneration: 1, offset: 0, limit: 4, isRefreshRequested: false },
      ],
    },
    {
      path: '/?q=not%20a%20domain!',
      query: 'not a domain!',
      viewStateTag: 'Failed',
      clocks: [],
    },
    { path: '/?q=', query: '', viewStateTag: 'Idle', clocks: [] },
  ])(
    'initializes $path from the URL and clocks valid searches before loading domain results',
    ({ path, query, viewStateTag, clocks }) =>
      Story.story(
        { block: ApplicationBlock, layer },
        Story.init(urlOrThrow(`http://localhost${path}`)),
        Story.model(model => {
          expect(model.searchLayout).toBe(query ? 'Search' : 'Landing')
          expect(model.cart).toEqual([])
          expect(routeToQuery(model.route)).toBe(query)
          expect(searchViewState(model)._tag).toBe(viewStateTag)
        }),
        resolveResultsListScrolls,
        Story.Command.expectExact(
          ReleaseEarlySearchListeners(),
          ...Array.map(clocks, clock => ReadCurrentTime(clock)),
        ),
        Story.Command.resolve(
          ReleaseEarlySearchListeners,
          Message.CompletedReleaseEarlySearchListeners({
            isSearchStarted: false,
          }),
        ),
        ...Array.flatMap(clocks, () => [
          resolveSearchTime(1, 0),
          resolveDomainsSuccess(
            { label: 'acme', offset: 0, limit: 4 },
            1,
            Array.take(makeDomainFixtures('acme'), 4),
          ),
          resolveRemainingFirstPageDomains(
            'acme',
            1,
            2,
            Array.take(Array.drop(makeDomainFixtures('acme'), 4), 56),
          ),
        ]),
        resolveResultsListScrolls,
        Story.Command.expectNone(),
      ),
  )
})
