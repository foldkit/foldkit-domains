/**
 * A Step that returns the identical incoming Model and the supplied OutMessage,
 * retaining their exact types without Commands or Service requirements.
 */
export type OutMessageStep<Model, OutMessage> = <Current extends Model>(
  model: Current,
) => Readonly<{ model: Current; outMessage: OutMessage; commands?: never }>

/**
 * Creates a reusable Step that preserves the incoming Model and emits a value
 * from the owning Block's declared OutMessage contract. Construction is passive.
 *
 * Use `makeStep` when the OutMessage depends on the current Model. Use
 * `Update.withOutMessage` to attach an OutMessage to an existing plain result,
 * preserving its Model and Commands, or when the OutMessage may be undefined.
 */
export interface MakeOutMessageStep<Model, OutMessage> {
  <const Value extends OutMessage>(
    outMessage: Value & (0 extends 1 & Value ? never : unknown),
  ): OutMessageStep<Model, Value>
}

/** @internal Creates the OutMessage-only Step authoring helper. */
export const makeOutMessageStep =
  <Model, OutMessage>(): MakeOutMessageStep<Model, OutMessage> =>
  outMessage =>
  model => ({ model, outMessage })
