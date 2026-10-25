import type { Command } from '../command/index.js'
import type * as Update from '../update/update.js'

/**
 * A Model-preserving Step retaining its Command types and Binding graph
 * obligations, without an OutMessage.
 */
export type CommandsStep<
  Model,
  CommandValue extends Command<any, never, any>,
  Evidence,
> = (model: Update.GraphInput<Model, Evidence>) => Readonly<{
  model: Model
  outMessage?: never
  commands: ReadonlyArray<CommandValue> &
    ([Evidence] extends [never]
      ? unknown
      : Update.RegistrationEvidence<Evidence>)
}>

/**
 * Creates a reusable Step that preserves the incoming Model and returns the
 * supplied Commands for Runtime execution. Construction does not execute them.
 *
 * Result Messages must belong to the owning Block. Command types retain their
 * Service requirements and child Binding registration evidence.
 * Use the general Step helper when Commands depend on the current Model or the
 * transition also changes fields or produces an OutMessage.
 */
export interface MakeCommandsStep<Model, Message> {
  <const Commands extends Update.Commands<Message, any>>(
    commands: Commands & Update.ValidateConcreteResultEvidence<Commands>,
  ): CommandsStep<
    Model,
    Commands[number],
    Update.ResultEvidenceChannelOf<Commands>
  >
}

/** @internal Creates the Command-only Step authoring helper. */
export const makeCommandsStep = <Model, Message>(): MakeCommandsStep<
  Model,
  Message
> => {
  function commandsStep<const Commands extends Update.Commands<Message, any>>(
    commands: Commands & Update.ValidateConcreteResultEvidence<Commands>,
  ): CommandsStep<
    Model,
    Commands[number],
    Update.ResultEvidenceChannelOf<Commands>
  >
  function commandsStep(commands: Update.Commands<Message, any>): unknown {
    return (model: Model) => ({ model, commands })
  }

  return commandsStep
}
