import { ApplicationDefinition } from './blockProfileContract'
import * as Settings from './blockSettings'

export const SettingsBinding = ApplicationDefinition.makeBinding(
  Settings.SettingsBlock,
  {
    field: 'settings',
  },
).withOutMessagePolicy({
  fold: ApplicationDefinition.makeOutMessageFold(Settings.SettingsBlock, {
    ChangedTheme: ({ theme }) =>
      ApplicationDefinition.makeFieldsStep(() => ({
        previewTheme: () => theme,
      })),
  }),
})
