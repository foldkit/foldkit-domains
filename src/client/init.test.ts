import { Array } from 'effect'
import { Command } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { ReadSearchPlanningTime, ReleaseEarlySearchListeners } from './command'
import { init } from './init'
import { urlOrThrow } from './model.fixture'
import { routeToQuery } from './route'
import { searchPresentation } from './searchPresentation'

describe('startup', () => {
  test.each([
    { path: '/', query: '', presentationTag: 'Idle', clocks: [] },
    {
      path: '/?q=Acme.dev',
      query: 'Acme.dev',
      presentationTag: 'Loading',
      clocks: [
        {
          searchGeneration: 1,
          offset: 0,
          limit: 4,
          isRefreshRequested: false,
        },
      ],
    },
    {
      path: '/?q=not%20a%20domain!',
      query: 'not a domain!',
      presentationTag: 'Failed',
      clocks: [],
    },
    { path: '/?q=', query: '', presentationTag: 'Idle', clocks: [] },
  ])(
    'initializes $path from the URL and clocks valid searches before loading domain results',
    ({ path, query, presentationTag, clocks }) => {
      const applicationInit = init(urlOrThrow(`http://localhost${path}`))

      expect(applicationInit.model.searchLayout).toBe(
        query ? 'Search' : 'Landing',
      )
      expect(applicationInit.model.dataSource).toBe('Demo')
      expect(applicationInit.model.carts).toEqual({ Demo: [], Live: [] })
      expect(routeToQuery(applicationInit.model.route)).toBe(query)
      expect(searchPresentation(applicationInit.model)._tag).toBe(
        presentationTag,
      )
      expect(
        Array.getSomes(
          Array.map(
            applicationInit.commands ?? [],
            Command.argsOf(ReadSearchPlanningTime),
          ),
        ),
      ).toEqual(clocks)
      expect(
        Array.getSomes(
          Array.map(
            applicationInit.commands ?? [],
            Command.argsOf(ReleaseEarlySearchListeners),
          ),
        ),
      ).toHaveLength(1)
    },
  )
})
