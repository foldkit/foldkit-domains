import { Effect, Option, Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

const Model = Schema.Struct({ panelHeight: Schema.Option(Schema.Number) })
const Message = defineMessageUnion({
  CompletedMeasurePanel: { height: Schema.Number },
})

const PanelDefinition = Block.makeDefinition('Panel', { Model, Message })

const MeasurePanel = PanelDefinition.makeMount('MeasurePanel', {
  messages: [Message.CompletedMeasurePanel],
  handler: function* () {
    return ({ element }) =>
      Effect.sync(() =>
        Message.CompletedMeasurePanel({
          height: element.getBoundingClientRect().height,
        }),
      )
  },
})

const PanelComposition = PanelDefinition.makeComposition({
  mounts: [MeasurePanel],
})

const update = PanelComposition.makeUpdate((model, message) =>
  Message.match(message, {
    CompletedMeasurePanel: ({ height }) => ({
      model: modifyFields(model, {
        panelHeight: () => Option.some(height),
      }),
    }),
  }),
)

const view = PanelComposition.makeView((model, h) => ({
  title: 'Measured panel',
  body: h.div(
    [h.OnMount(MeasurePanel())],
    [
      Option.match(model.panelHeight, {
        onNone: () => 'Measuring',
        onSome: height => `Height: ${height}`,
      }),
    ],
  ),
}))

const init = PanelComposition.makeInit(() => ({
  model: Model.make({ panelHeight: Option.none() }),
}))

const prepare = () =>
  PanelComposition.prepareBlock({
    init,
    update,
    view,
    EffectsLayer: MeasurePanel.layer,
  })
export const PanelBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
