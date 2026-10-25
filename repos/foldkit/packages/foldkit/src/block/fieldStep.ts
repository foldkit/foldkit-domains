import { Struct } from 'effect'

type ModelOnlyReturn<Model> = Readonly<{
  model: Model
  commands?: never
  outMessage?: never
}>

type FieldTransforms<Model> = Partial<{
  [Field in keyof Model]: (value: Model[Field]) => Model[Field]
}>

type KeysOfUnion<Value> = Value extends unknown ? keyof Value : never

type FieldStepModel<
  Model extends object,
  Transforms extends FieldTransforms<Model>,
> = ReturnType<typeof Struct.evolve<Model, Transforms>>

type ValidateTransforms<
  Model extends object,
  Transforms extends FieldTransforms<Model>,
> = ([Exclude<keyof Transforms, KeysOfUnion<Model>>] extends [never]
  ? unknown
  : Readonly<Record<Exclude<keyof Transforms, KeysOfUnion<Model>>, never>>) &
  ([FieldStepModel<Model, Transforms>] extends [Model]
    ? unknown
    : Readonly<{
        'Field transformations must preserve the owning Model': never
      }>)

interface ObjectStepFields<Model extends object> {
  <
    const Evolve extends (model: Model) => FieldTransforms<Model>,
    const Validation extends ValidateFieldStep<Model, NoInfer<Evolve>> =
      ValidateFieldStep<Model, NoInfer<Evolve>>,
  >(
    evolve: Evolve,
    ...validation: Validation
  ): NoInfer<
    (model: Model) => ModelOnlyReturn<FieldStepModel<Model, ReturnType<Evolve>>>
  >
}

type ValidateFieldStep<
  Model extends object,
  Evolve extends (model: Model) => FieldTransforms<Model>,
> =
  unknown extends ValidateTransforms<Model, ReturnType<Evolve>>
    ? readonly []
    : readonly [error: ValidateTransforms<Model, ReturnType<Evolve>>]

/**
 * Authors a Model-only Step from field transformations. The callback receives
 * the current Model when the Step is applied. Each transformer receives its
 * current field value and must preserve that field's type and the Model's
 * variant constraints. Unknown fields are rejected.
 *
 * Use Binding operations for child Block transitions. This helper authors
 * changes to the owning Block's fields and returns no Commands or OutMessage.
 */
export type DefineStepFields<Model> = [Model] extends [ReadonlyArray<unknown>]
  ? never
  : [Model] extends [object]
    ? ObjectStepFields<Extract<Model, object>>
    : never

/** @internal Creates the field Step authoring helper without running its callback. */
export const makeStepFields = <
  Model extends object,
>(): ObjectStepFields<Model> => {
  function stepFields<
    const Evolve extends (model: Model) => FieldTransforms<Model>,
    const Validation extends ValidateFieldStep<Model, NoInfer<Evolve>> =
      ValidateFieldStep<Model, NoInfer<Evolve>>,
  >(
    evolve: Evolve,
    ...validation: Validation
  ): NoInfer<
    (model: Model) => ModelOnlyReturn<FieldStepModel<Model, ReturnType<Evolve>>>
  >
  function stepFields(
    evolve: (model: Model) => FieldTransforms<Model>,
  ): unknown {
    return (model: Model) => ({ model: Struct.evolve(model, evolve(model)) })
  }

  return stepFields
}

/**
 * Creates a Step that returns the identical incoming Model and no Commands or
 * OutMessage. In an OutMessage policy it acknowledges the named child fact
 * without undoing the child transition or suppressing its Message.
 */
export interface DefineStepNoop<Model> {
  (): <Current extends Model>(model: Current) => ModelOnlyReturn<Current>
}

/** @internal Creates the Model-preserving Step without an execution mechanism. */
export const makeStepNoop =
  <Model>(): ReturnType<DefineStepNoop<Model>> =>
  model => ({ model })
