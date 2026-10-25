import { Effect, Layer, Schema } from 'effect'
import * as Block from 'foldkit/block'
import { defineMessageUnion } from 'foldkit/message'
import { run } from 'foldkit/runtime'
import * as Update from 'foldkit/update'

import {
  ChildBlock,
  CounterComposition,
  Model as CounterModel,
  ParentDefinition,
  PersistLayer,
  RequiredRestBlock,
  RequiredRestParentDefinition,
  RootComposition,
  SaveClient,
  earlyReturnUpdate,
  makePendingApplication,
  parentMessage,
  parentModel,
  parentUpdate,
  rootInit,
  rootUpdate,
  rootView,
  ternaryUpdate,
} from './dual-update.accepted.js'

const rejectMissingBranchHandlers = () => {
  // @ts-expect-error A Command in one ternary branch still requires its handler.
  CounterComposition.prepareBlock({
    init: () => ({ model: CounterModel.make({ count: 0 }) }),
    update: ternaryUpdate,
  })
  // @ts-expect-error A Command before an early return still requires its handler.
  CounterComposition.prepareBlock({
    init: () => ({ model: CounterModel.make({ count: 0 }) }),
    update: earlyReturnUpdate,
  })
}
void rejectMissingBranchHandlers

const Model = Schema.Struct({ count: Schema.Number })
const Message = defineMessageUnion({ ChangedCount: { amount: Schema.Number } })
// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct Block or Application identity for type coverage.

// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct Block or Application identity for type coverage.
const Composition = Block.makeDefinition('DualUpdateRejectedCounter', {
  Model,
  Message,
}).makeComposition()
const update = Composition.makeUpdate(
  (model, _message, _context: Readonly<{ multiplier: number }>) => ({ model }),
)
const message = Message.ChangedCount({ amount: 1 })
const model = Model.make({ count: 0 })
const step = update(message)

// @ts-expect-error Required context is supplied after the curried Step's Model.
step(model)

// @ts-expect-error A context-bearing curried update is not a unary Step.
Update.combineSteps(model, [step])

// @ts-expect-error The two-argument form is the canonical data-first call.
update(message, { multiplier: 2 })

// @ts-expect-error The data-first form retains the required context.
update(model, message)

RequiredRestParentDefinition.makeBinding(RequiredRestBlock, {
  // @ts-expect-error A required-rest contextual child must provide generated delivery context.
  field: 'child',
  // @ts-expect-error A required-rest contextual child must provide generated delivery context.
  delivery: {},
})

const AlternativeChildBinding = ParentDefinition.makeBinding(ChildBlock, {
  field: 'child',
  placement: 'alternative',
})
const OmittedComposition = ParentDefinition.makeComposition({
  bindings: [AlternativeChildBinding],
})
// @ts-expect-error An update from another child graph carries that graph's generated dispatch Schema.
const omittedDirectUpdate = OmittedComposition.makeUpdate((current, _message) =>
  parentUpdate(parentMessage)(current),
)
const omittedComposedUpdate = OmittedComposition.makeUpdate(
  // @ts-expect-error Update.combineSteps preserves the originating graph's generated dispatch Schema.
  (current, _message) =>
    Update.combineSteps(current, [parentUpdate(parentMessage)]),
)

void omittedDirectUpdate
void omittedComposedUpdate

OmittedComposition.prepareBlock({
  init: () => ({ model: parentModel }),
  update: OmittedComposition.makeUpdate((current, _message) => ({
    model: current,
  })),
  // @ts-expect-error Exposed operations produce local Message tuples, not Model-first Steps.
  operations: { handleChild: parentUpdate(parentMessage) },
  EffectsLayer: Layer.empty,
})

// @ts-expect-error Block completion requires the update's Command handler Layer.
RootComposition.prepareBlock({
  init: rootInit,
  update: rootUpdate,
  view: rootView,
})

// @ts-expect-error A completed Application cannot run before its ordinary Service is provided.
run(makePendingApplication())

run(
  makePendingApplication().provide(
    Layer.succeed(SaveClient, { save: Effect.void }),
  ),
)

void PersistLayer
