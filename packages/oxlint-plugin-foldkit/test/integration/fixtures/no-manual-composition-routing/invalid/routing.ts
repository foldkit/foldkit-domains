import { Match } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

const Message = defineMessageUnion({
  GotDialogMessage: { message: Dialog.Message },
  GotExtractedMessage: { message: Extracted.Message },
  GotInlineMessage: { message: Inline.Message },
  GotPickerEvent: { event: Picker.Message },
  ClickedSave: {},
})
const ApplicationDefinition = Block.makeDefinition('Application', {
  Model,
  Message,
})

ApplicationDefinition.makeBinding(DialogBlock, {
  field: 'dialog',
  parentMessage: Message.GotDialogMessage,
  fromParentMessage: false,
})

ApplicationDefinition.makeBinding(PickerBlock, {
  field: 'picker',
  toParentMessage: message => Message.GotPickerEvent({ event: message }),
})

const ApplicationComposition = ApplicationDefinition.makeComposition()

const extractedHandlers = {
  GotExtractedMessage: () => ({ model: Model.make({}) }),
  ClickedSave: () => ({ model: Model.make({}) }),
}
const extractedUpdate = (model: unknown, message: unknown) =>
  Message.match(message, extractedHandlers)

ApplicationComposition.makeUpdate(extractedUpdate)

ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    GotInlineMessage: () => ({ model }),
    ClickedSave: () => ({ model }),
  }),
)

ApplicationComposition.makeUpdate((model, message) =>
  Match.value(message).pipe(
    Match.tag('GotPickerEvent', () => ({ model })),
    Match.orElse(() => ({ model })),
  ),
)

const broadUpdate = (model: unknown, message: { _tag: string }) =>
  message._tag === 'GotDialogMessage' ? { model } : { model }

ApplicationComposition.makeUpdate(broadUpdate)

ApplicationComposition.makeUpdate((model, message) =>
  message.message._tag === 'ChangedDialog' ? { model } : { model },
)
