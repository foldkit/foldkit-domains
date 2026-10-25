import { Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import * as BoundSettings from './boundSettings'

const Model = Schema.Struct({ settings: BoundSettings.Model })
const Message = defineMessageUnion({
  ClickedChangeTheme: {},
})
const ApplicationDefinition = Block.makeDefinition('Application', {
  Model,
  Message,
})
const SettingsBinding = ApplicationDefinition.makeBinding(
  BoundSettings.BoundSettingsBlock,
  {
    field: 'settings',
    init: true,
  },
)
ApplicationDefinition.makeComposition({ bindings: [SettingsBinding] })

const OtherMessage = defineMessageUnion({ ChangedTheme: {} })
const OtherApplication = Block.makeDefinition('OtherApplication', {
  Model,
  Message: OtherMessage,
})
const OtherApplicationComposition = OtherApplication.makeComposition()

export const update = OtherApplicationComposition.makeUpdate(model => ({
  model: modifyFields(model, {
    settings: settings =>
      modifyFields(settings, { theme: () => 'Light' }),
  }),
}))
