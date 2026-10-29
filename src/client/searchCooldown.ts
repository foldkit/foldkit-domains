import { Match, Schema } from 'effect'

import { RateLimitSource } from '../shared/domainsRpc'

export const SearchCooldown = Schema.Struct({
  source: RateLimitSource,
  expiresAtMillis: Schema.Number,
})
export type SearchCooldown = typeof SearchCooldown.Type

export const formatRateLimitMessage = (
  source: RateLimitSource,
  retryAfterSeconds: number,
) => {
  const unit = retryAfterSeconds === 1 ? 'second' : 'seconds'

  const description = Match.value(source).pipe(
    Match.when('Client', () => 'Too many searches.'),
    Match.when('Application', () => 'Search is busy.'),
    Match.when('Registrar', () => 'The domain provider is busy.'),
    Match.exhaustive,
  )

  return `${description} Please try again in ${retryAfterSeconds} ${unit}.`
}
