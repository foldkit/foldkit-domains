import { Command, Update } from 'foldkit'

import {
  CounterComposition,
  EarlyReturnBlock,
  GraphFullBlock,
  GraphFullModel,
  Message,
  Model,
  OutMessage,
  Save,
  TernaryBlock,
  changedCount,
  combineGenericSteps,
  earlyReturnUpdate,
  graphFullMessage,
  requiredContextUpdate,
  ternaryUpdate,
  update,
} from './dual-update.accepted.js'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

const step = update(changedCount)
const initial = Model.make({ count: 0 })
const combined = Update.combineSteps(initial, [step, update(changedCount)])
const genericCombined = combineGenericSteps(initial, [step])
const contextual = requiredContextUpdate(changedCount)(initial, {
  multiplier: 2,
})
const fullStep = GraphFullBlock.update(graphFullMessage)
export type ExactModel = Expect<Equal<typeof combined.model, typeof Model.Type>>
export type ExactGenericRequirements = Expect<
  Equal<
    Update.RequirementsOf<() => typeof genericCombined>,
    Command.HandlerOf<typeof Save>
  >
>
export type ExactContextualModel = Expect<
  Equal<typeof contextual.model, typeof Model.Type>
>
export type ExactCompletedModel = Expect<
  Equal<Parameters<typeof fullStep>[0], typeof GraphFullModel.Type>
>

export type ExactTernaryReturn = Expect<
  Equal<
    ReturnType<typeof ternaryUpdate>,
    Update.ReturnWithOutMessage<
      typeof Model.Type,
      typeof Message.Type,
      typeof OutMessage.Type,
      Command.HandlerOf<typeof Save>
    >
  >
>
export type ExactEarlyReturn = Expect<
  Equal<ReturnType<typeof earlyReturnUpdate>, ReturnType<typeof ternaryUpdate>>
>
export type ExactTernaryRequirements = Expect<
  Equal<
    Update.RequirementsOf<typeof ternaryUpdate>,
    Command.HandlerOf<typeof Save>
  >
>
export type ExactEarlyReturnRequirements = Expect<
  Equal<
    Update.RequirementsOf<typeof earlyReturnUpdate>,
    Command.HandlerOf<typeof Save>
  >
>
export type ExactCompletedTernaryReturn = Expect<
  Equal<
    ReturnType<typeof TernaryBlock.update>,
    ReturnType<typeof ternaryUpdate>
  >
>
export type ExactCompletedEarlyReturn = Expect<
  Equal<
    ReturnType<typeof EarlyReturnBlock.update>,
    ReturnType<typeof earlyReturnUpdate>
  >
>

const rejectMissingBranchHandlers = () => {
  // @ts-expect-error Emitted ternary Commands still require their handler.
  CounterComposition.prepareBlock({
    init: () => ({ model: initial }),
    update: ternaryUpdate,
  })
  // @ts-expect-error Emitted early-return Commands still require their handler.
  CounterComposition.prepareBlock({
    init: () => ({ model: initial }),
    update: earlyReturnUpdate,
  })
}
void rejectMissingBranchHandlers
void step
