import { Schema, Tuple } from 'effect'
import * as Block from 'foldkit/block'
import type { Html } from 'foldkit/html'
import type * as Update from 'foldkit/update'

import {
  type BaseInitConfig,
  BaseModel,
  type BaseViewInputs,
  EffectsLayer,
  ListboxNamespace,
  Message,
  OutMessage,
  type OutMessageSchema,
  baseInit,
  makeUpdate,
  makeView,
  mounts,
} from './shared.js'

type RefineOutMessage<Return, OutMessage> =
  Return extends Update.ResultRecipe<
    infer Model,
    infer Message,
    unknown,
    infer R,
    infer Evidence
  >
    ? Update.ResultRecipe<Model, Message, OutMessage, R, Evidence>
    : Return extends (...args: infer Args) => infer Output
      ? (...args: Args) => RefineOutMessage<Output, OutMessage>
      : Return extends unknown
        ? Omit<Return, 'outMessage'> & Readonly<{ outMessage?: OutMessage }>
        : never

// MODEL

/** Schema for the multi-select listbox's private interaction state (open/closed status, active item, activation trigger, typeahead search). The selection is owned by the parent and passed in via `ViewInputs.selectedValues`. */
export const Model = Schema.Struct({
  ...BaseModel.fields,
})

export type Model = typeof Model.Type

// INIT

/** Configuration for creating a multi-select listbox model with `init`. `isAnimated` enables CSS transition coordination (default `false`). `isModal` locks page scroll and inerts other elements when open (default `false`). */
export type InitConfig = BaseInitConfig

// VIEW

/** Per-render view inputs passed to the view through a Listbox connection. */
export type ViewInputs<Item, Value extends string = string> = BaseViewInputs<
  Item,
  Value
>

const internalView = makeView<Model>({ ariaMultiSelectable: true })

const makeBlockParts = <Item, Value extends string>() => {
  const RefinedOutMessage =
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    OutMessage as unknown as OutMessageSchema<Value>
  const ListboxDefinition = ListboxNamespace.makeDefinition({
    Model,
    Message,
    OutMessage: RefinedOutMessage,
  })
  const itemUpdate = makeUpdate(
    ListboxDefinition.makeBinding,
    ListboxDefinition.makeOutMessageFold,
    ListboxDefinition.makeStep,
    ListboxDefinition.makeFieldsStep,
    ListboxDefinition.makeNoopStep,
    'KeepOpen',
    (model, item) => ({
      model,
      outMessage: OutMessage.Selected({ value: item }),
    }),
  )
  type RefinedOutMessage = OutMessage<Value>
  type RefinedReturn = RefineOutMessage<
    ReturnType<typeof itemUpdate.update>,
    RefinedOutMessage
  >

  const castReturn = (result: ReturnType<typeof itemUpdate.update>) =>
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    result as unknown as RefinedReturn
  const ListboxComposition = ListboxDefinition.makeComposition({
    mounts,
    bindings: [itemUpdate.AnimationBinding],
  })
  const authoredUpdate = ListboxDefinition.makeStep(
    (model, message: Parameters<typeof itemUpdate.update>[1]) =>
      castReturn(itemUpdate.update(model, message)),
  )
  const update = ListboxComposition.makeUpdate((model, message) =>
    authoredUpdate(model, message),
  )
  const init = ListboxComposition.makeInit((config: InitConfig) => ({
    model: baseInit(config),
  }))
  const refinedView =
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    internalView<
      Item,
      Value,
      typeof ListboxComposition.Message.Type
    >() as unknown as (
      model: Model,
      viewInputs: ViewInputs<Item, Value>,
      h: Parameters<
        ReturnType<
          typeof internalView<
            unknown,
            string,
            typeof ListboxComposition.Message.Type
          >
        >
      >[2],
    ) => Html
  const view = ListboxComposition.makeView.withInputs<ViewInputs<Item, Value>>(
    (model, viewInputs, h) => refinedView(model, viewInputs, h),
  )
  const requestOpen = Message.RequestedOpen
  const requestClose = Message.RequestedClose
  const requestSelectItem = (item: Value) =>
    Tuple.make(Message.RequestedSelectItem({ item }))
  return {
    composition: ListboxComposition,
    implementation: {
      init,
      update,
      view,
      operations: { requestOpen, requestClose, requestSelectItem },
      EffectsLayer,
    },
  }
}

type BlockParts<Item, Value extends string> = ReturnType<
  typeof makeBlockParts<Item, Value>
>

/** A completed multi-select Listbox Block refined to one Item and Value pair. */
export interface Completed<
  Item = string,
  Value extends string = Item extends string ? Item : string,
> extends Block.CompletedWithViewAndOutMessage<
  BlockParts<Item, Value>['composition'],
  BlockParts<Item, Value>['implementation']
> {}

const makeBlock = <Item, Value extends string>(): Completed<Item, Value> => {
  const { composition, implementation } = makeBlockParts<Item, Value>()

  const prepare = () => composition.prepareBlock(implementation)
  const completedBlock: Block.FromAssemblyWithViewAndOutMessage<
    typeof Model,
    typeof prepare
  > = Block.assemble(prepare)

  return completedBlock
}

/** Creates a complete multi-select Listbox Block refined to one Item and
 * Value pair. `Value` defaults to `Item` for string items and to `string` for
 * object items. */
export const create = <
  Item = string,
  Value extends string = Item extends string ? Item : string,
>(): Completed<Item, Value> => makeBlock<Item, Value>()

/** Complete default multi-select Listbox Block definition. */
export const block = makeBlock<string, string>()

/** Creates the initial multi-select Listbox Model and Commands. Defaults to closed with no active item. */
export const init = block.init

// UPDATE

/** Processes a Listbox Message and returns the next Model, optional Commands,
 *  and an optional OutMessage. Selection leaves the multi-select Listbox open
 *  and emits `Selected({ value })` for the parent to fold by toggling
 *  membership. */
export const update = block.update

type UpdateReturn = ReturnType<typeof update>

/** Programmatically opens the Listbox, updating the Model and returning focus
 *  and modal Commands. When it is already open, returns the Model unchanged
 *  with no Commands. Use this in domain-event handlers. */
export const open = (model: Model): UpdateReturn =>
  block.operations.requestOpen(model)

/** Programmatically closes the listbox. If it is open, returns the closed Model
 *  with focus and modal Commands. If it is already closed, returns the Model
 *  unchanged with no Commands. Use this in domain-event handlers to close the
 *  listbox. */
export const close = (model: Model): UpdateReturn =>
  block.operations.requestClose(model)

/** Programmatically activates an item in the multi-select listbox. Emits `Selected({ value })`; the parent toggles the value's membership. */
export const selectItem = (model: Model, item: string): UpdateReturn =>
  block.operations.requestSelectItem(model, item)
