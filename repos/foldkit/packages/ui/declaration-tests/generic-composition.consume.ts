import { Duration } from 'effect'
import type * as Block from 'foldkit/block'

import * as DragAndDrop from '@foldkit/ui/dragAndDrop'
import * as Slider from '@foldkit/ui/slider'
import * as Tooltip from '@foldkit/ui/tooltip'

import {
  DialogBinding,
  DragAndDropBinding,
  KeyedDragAndDropBinding,
  KeyedToastBinding,
  Picker,
  PickerBinding,
  RootSlider,
  ToastBlock,
  WithOutMessageOnly,
  WithViewAndOutMessage,
  WithViewOnly,
  WithoutViewOrOutMessage,
  createComposition,
} from './generic-composition.accepted.js'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

export type RelocatedAssertions = [
  Expect<Equal<Parameters<typeof KeyedDragAndDropBinding.fold>[1], 'Primary'>>,
  Expect<Equal<Parameters<typeof KeyedToastBinding.fold>[1], 'Primary'>>,
  Expect<Equal<Parameters<typeof DialogBinding.requestOpen>, []>>,
  Expect<
    Equal<
      Parameters<typeof PickerBinding.requestSelectItem>,
      [item: 'Apple' | 'Pear', displayText: string]
    >
  >,
  Expect<
    Equal<
      Block.ViewBuilderFor<ReturnType<typeof createComposition>> extends never
        ? true
        : false,
      false
    >
  >,
]

DialogBinding.requestOpen()

DragAndDrop.test.settleFocus({
  binding: DragAndDropBinding,
  itemId: 'card-1',
})
DragAndDrop.test.resolveKeyboardMove({
  binding: KeyedDragAndDropBinding,
  key: 'Primary',
  itemId: 'card-1',
  targetContainerId: 'done',
  targetIndex: 0,
})
DragAndDrop.test.resolveKeyboardMove({
  binding: KeyedDragAndDropBinding,
  // @ts-expect-error The relocated keyed helper retains its literal key.
  key: 'Secondary',
  itemId: 'card-1',
  targetContainerId: 'done',
  targetIndex: 0,
})

// @ts-expect-error The relocated Dialog operation takes no arguments.
DialogBinding.requestOpen('unexpected')

PickerBinding.requestSelectItem('Apple', 'Apple')

Slider.SliderBlock.operations.informRangeChanged(
  Slider.SliderBlock.init({ id: 'relocated-range', min: 0, max: 100, step: 1 })
    .model,
  { min: 10, max: 90 },
)
RootSlider.operations.informRangeChanged(
  Slider.SliderBlock.init({
    id: 'relocated-root-range',
    min: 0,
    max: 100,
    step: 1,
  }).model,
  { min: 20, max: 80 },
)
Tooltip.TooltipBlock.operations.informShowDelayChanged(
  Tooltip.TooltipBlock.init({ id: 'relocated-tooltip' }).model,
  Duration.millis(250),
)
ToastBlock.operations.requestShow(
  ToastBlock.init({ id: 'relocated-toast' }).model,
  {
    payload: { kind: 'Saved' },
    duration: '1 second',
  },
)

// @ts-expect-error The emitted generic operation rejects an unrelated item.
PickerBinding.requestSelectItem('Banana', 'Banana')

Picker.Message.SelectedItem({
  // @ts-expect-error The emitted Message constructor keeps the refined payload.
  item: 'Banana',
  displayText: 'Banana',
  wasSelected: false,
})

WithViewAndOutMessage.replaceEffectsLayer(WithViewAndOutMessage.EffectsLayer)
WithOutMessageOnly.replaceEffectsLayer(WithOutMessageOnly.EffectsLayer)
WithViewOnly.replaceEffectsLayer(WithViewOnly.EffectsLayer)
WithoutViewOrOutMessage.replaceEffectsLayer(
  WithoutViewOrOutMessage.EffectsLayer,
)
