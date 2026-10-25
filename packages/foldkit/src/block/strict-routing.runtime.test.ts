import { Array, Schema } from 'effect'
import { expect, it } from 'vitest'

import { defineMessageUnion } from '../message/index.js'
import { modifyFields } from '../struct/index.js'
import { makeDefinition } from './define.js'
import { makeCompositionUpdate } from './delivery.js'
import * as Block from './public.js'

const ChildModel = Schema.Struct({ count: Schema.Number })
const ChildMessage = defineMessageUnion({
  ChangedCount: { amount: Schema.Number },
})

const ChildComposition = makeDefinition('StrictRoutingRuntimeChild', {
  Model: ChildModel,
  Message: ChildMessage,
}).makeComposition()
const prepareChildBlock = () =>
  ChildComposition.prepareBlock({
    init: () => ({ model: ChildModel.make({ count: 0 }) }),
    update: ChildComposition.makeUpdate((model, { amount }) => ({
      model: modifyFields(model, { count: count => count + amount }),
    })),
  })
const ChildBlock: Block.FromAssemblyWithoutViewOrOutMessage<
  typeof ChildModel,
  typeof prepareChildBlock
> = Block.assemble(prepareChildBlock)

const ContextChildComposition = makeDefinition(
  'StrictRoutingRuntimeContextChild',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
).makeComposition()
const prepareContextChildBlock = () =>
  ContextChildComposition.prepareBlock({
    init: () => ({ model: ChildModel.make({ count: 0 }) }),
    update: ContextChildComposition.makeUpdate(
      (model, { amount }, context: Readonly<{ multiplier: number }>) => ({
        model: modifyFields(model, {
          count: count => count + amount * context.multiplier,
        }),
      }),
    ),
  })
const ContextChildBlock: Block.FromAssemblyWithoutViewOrOutMessage<
  typeof ChildModel,
  typeof prepareContextChildBlock
> = Block.assemble(prepareContextChildBlock)

const Entry = Schema.Struct({ id: Schema.String, child: ChildModel })
const ParentModel = Schema.Struct({
  child: ChildModel,
  contextualChild: ChildModel,
  entries: Schema.Array(Entry),
  multiplier: Schema.Number,
  resets: Schema.Number,
})
const ParentMessage = defineMessageUnion({
  ClickedReset: {},
})
const Parent = makeDefinition('StrictRoutingRuntimeParent', {
  Model: ParentModel,
  Message: ParentMessage,
})

const ChildBinding = Parent.makeBinding(ChildBlock, {
  field: 'child',
})
const ContextBinding = Parent.makeBinding(ContextChildBlock, {
  field: 'contextualChild',
  delivery: {
    toUpdateContext: model => [{ multiplier: model.multiplier }],
  },
})
const EntryBinding = Parent.makeBinding(ChildBlock, {
  readAll: model => model.entries,
  key: entry => entry.id,
  read: entry => entry.child,
  writeAt: (model, id, nextChild) =>
    modifyFields(model, {
      entries: Array.map(entry =>
        entry.id === id
          ? modifyFields(entry, { child: () => nextChild })
          : entry,
      ),
    }),
  keySchema: Schema.String,
  delivery: {
    when: (_model, id) => id === 'active',
  },
})

const ParentComposition = Parent.makeComposition({
  bindings: [ChildBinding, ContextBinding, EntryBinding],
})
const parentUpdate = ParentComposition.makeUpdate(model => ({
  model: modifyFields(model, { resets: resets => resets + 1 }),
}))
const parentModel = ParentModel.make({
  child: ChildModel.make({ count: 0 }),
  contextualChild: ChildModel.make({ count: 0 }),
  entries: [Entry.make({ id: 'active', child: ChildModel.make({ count: 0 }) })],
  multiplier: 3,
  resets: 0,
})

const rawFullMessageUpdate = (
  model: typeof ParentModel.Type,
  message: Parameters<typeof parentUpdate>[1],
) => ({
  model: modifyFields(model, {
    resets: resets =>
      message._tag === 'GotChildMessage' ? resets + 100 : resets + 1,
  }),
})
const prepareRawCompletionBlock = () =>
  ParentComposition.prepareBlock({
    init: () => ({ model: parentModel }),
    update: rawFullMessageUpdate,
  })
const RawCompletionBlock: Block.FromAssemblyWithoutViewOrOutMessage<
  typeof ParentModel,
  typeof prepareRawCompletionBlock
> = Block.assemble(prepareRawCompletionBlock)
const prepareGeneratedCompletionBlock = () =>
  ParentComposition.prepareBlock({
    init: () => ({ model: parentModel }),
    update: parentUpdate,
  })
const GeneratedCompletionBlock: Block.FromAssemblyWithoutViewOrOutMessage<
  typeof ParentModel,
  typeof prepareGeneratedCompletionBlock
> = Block.assemble(prepareGeneratedCompletionBlock)

it('routes canonical, contextual, and keyed Messages before authored facts', () => {
  const canonical = parentUpdate(parentModel, {
    _tag: 'GotChildMessage',
    placement: 'child',
    generation: 0,
    message: ChildMessage.ChangedCount({ amount: 2 }),
  })
  const contextual = parentUpdate(parentModel, {
    _tag: 'GotContextualChildMessage',
    placement: 'contextualChild',
    generation: 0,
    message: ChildMessage.ChangedCount({ amount: 2 }),
  })
  const keyed = parentUpdate(parentModel, {
    _tag: 'GotStrictRoutingRuntimeChildMessage',
    placement: 'StrictRoutingRuntimeChild',
    generation: 0,
    key: 'active',
    message: ChildMessage.ChangedCount({ amount: 2 }),
  })
  const stale = parentUpdate(parentModel, {
    _tag: 'GotStrictRoutingRuntimeChildMessage',
    placement: 'StrictRoutingRuntimeChild',
    generation: 0,
    key: 'stale',
    message: ChildMessage.ChangedCount({ amount: 2 }),
  })
  const local = parentUpdate(parentModel, ParentMessage.ClickedReset())

  expect(canonical.model.child.count).toBe(2)
  expect(canonical.model.resets).toBe(0)
  expect(contextual.model.contextualChild.count).toBe(6)
  expect(keyed.model.entries).toEqual([{ id: 'active', child: { count: 2 } }])
  expect(stale.model).toBe(parentModel)
  expect(local.model.resets).toBe(1)
})

it('installs routing around a raw full-Message completion update', () => {
  const routed = RawCompletionBlock.update(parentModel, {
    _tag: 'GotChildMessage',
    placement: 'child',
    generation: 0,
    message: ChildMessage.ChangedCount({ amount: 1 }),
  })
  const local = RawCompletionBlock.update(
    parentModel,
    ParentMessage.ClickedReset(),
  )

  expect(routed.model.child.count).toBe(1)
  expect(routed.model.resets).toBe(0)
  expect(local.model.resets).toBe(1)
  expect(RawCompletionBlock.update).not.toBe(rawFullMessageUpdate)
})

it('does not wrap an update authored by the same Composition twice', () => {
  expect(GeneratedCompletionBlock.update).toBe(parentUpdate)
})

it('rejects duplicate generated delivery placements for erased callers', () => {
  const duplicateBinding = Parent.makeBinding(ChildBlock, {
    field: 'child',
    placement: 'child',
    init: false,
  })

  expect(() =>
    Reflect.apply(Parent.makeComposition, Parent, [
      {
        bindings: [
          ChildBinding,
          ContextBinding,
          EntryBinding,
          duplicateBinding,
        ],
      },
    ]),
  ).toThrow('both resolve to placement "child"')
})

it('blocks an unclaimed Got Message hidden behind an opaque Schema', () => {
  const opaqueUpdate = makeCompositionUpdate(
    Schema.Unknown,
    [],
    false,
  )((model: Readonly<{ authored: number }>) => ({
    model: { authored: model.authored + 1 },
  }))

  expect(() =>
    opaqueUpdate(
      { authored: 0 },
      {
        _tag: 'GotDynamicMessage',
        message: ChildMessage.ChangedCount({ amount: 1 }),
      },
    ),
  ).toThrow('without an owning Binding')
})

it('reserves every Got prefix independent of its payload field name', () => {
  const EventMessage = defineMessageUnion({
    GotEvent: { event: Schema.String },
    ClickedReset: {},
  })

  expect(() => makeCompositionUpdate(EventMessage, [], true)).toThrow(
    'Parent Message "GotEvent" is a Got* child wrapper without an owning Binding',
  )
})
