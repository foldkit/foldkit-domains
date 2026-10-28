import { Array, Effect, pipe } from 'effect'

import { makeDemoDomains } from '../shared/demoDomains'
import { DomainCandidateRange } from '../shared/domain'
import { timeSearchPhase } from './searchTiming'

export const searchDemoDomains = (
  label: string,
  { offset, limit }: DomainCandidateRange,
) =>
  Effect.sync(() =>
    pipe(makeDemoDomains(label), Array.drop(offset), Array.take(limit)),
  ).pipe(timeSearchPhase('demo'))
