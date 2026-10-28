import { Clock, Duration, Effect, Number, Option, Schema, Stream } from 'effect'

import { makeSubscriptions } from './definition'
import { Message } from './message'

const waitUntilMillis = (deadlineMillis: number) =>
  Effect.gen(function* () {
    const startedAtMillis = yield* Clock.currentTimeMillis
    yield* Effect.sleep(
      Duration.millis(Number.max(0, deadlineMillis - startedAtMillis)),
    )
    return yield* Clock.currentTimeMillis
  })

export const subscriptions = makeSubscriptions(entry => ({
  searchCooldownExpiry: entry(
    'SearchCooldownExpiry',
    { maybeExpiresAtMillis: Schema.Option(Schema.Number) },
    {
      messages: [Message.ReachedSearchCooldownExpiry],
      modelToDependencies: model => ({
        maybeExpiresAtMillis: Option.map(
          model.maybeSearchCooldown,
          cooldown => cooldown.expiresAtMillis,
        ),
      }),
      handler: function* () {
        return ({ maybeExpiresAtMillis }) =>
          Option.match(maybeExpiresAtMillis, {
            onNone: () => Stream.empty,
            onSome: expiresAtMillis =>
              Stream.fromEffect(
                waitUntilMillis(expiresAtMillis).pipe(
                  Effect.map(nowMillis =>
                    Message.ReachedSearchCooldownExpiry({ nowMillis }),
                  ),
                ),
              ),
          })
      },
    },
  ),
}))
