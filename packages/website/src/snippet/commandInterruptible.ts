// application.ts
import { Effect, Schema } from 'effect'
import { Block, Command } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

const Model = Schema.Struct({ count: Schema.Number })

export const Message = defineMessageUnion({
  ClickedResetAfterDelay: {},
  ClickedCancelReset: {},
  CompletedWaitBeforeReset: {},
  CompletedCancelWaitBeforeReset: {
    outcome: Command.Interruptible.Outcome,
  },
})

const ApplicationDefinition = Block.makeDefinition('Application', {
  Model,
  Message,
})

export const WaitBeforeReset = ApplicationDefinition.makeCommand(
  'WaitBeforeReset',
  {
    messages: [Message.CompletedWaitBeforeReset],
    interrupt: true,
    handler: function* () {
      return () =>
        Effect.sleep('1 second').pipe(
          Effect.as(Message.CompletedWaitBeforeReset()),
        )
    },
  },
)

export const EffectsLayer = WaitBeforeReset.layer

const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedResetAfterDelay: () => ({
      model,
      commands: [WaitBeforeReset()],
    }),
    ClickedCancelReset: () => ({
      model,
      commands: [
        WaitBeforeReset.Interrupt(outcome =>
          Message.CompletedCancelWaitBeforeReset({ outcome }),
        ),
      ],
    }),
    CompletedWaitBeforeReset: () => ({
      model: modifyFields(model, { count: () => 0 }),
    }),
    CompletedCancelWaitBeforeReset: () => ({ model }),
  }),
)
