import type { Block } from 'foldkit'

import { ApplicationDefinition } from './definition'
import { Message } from './message'
import {
  EDITION_RADIO_GROUP_ID,
  EditionRadioGroupBlock,
  HARDCOVER_EDITION,
} from './model'
import { stepMachine } from './transition'

export const EditionRadioGroupBinding = ApplicationDefinition.makeBinding(
  EditionRadioGroupBlock,
  {
    field: 'editionRadioGroup',
    init: { contextToArgs: () => [{ id: EDITION_RADIO_GROUP_ID }] },
  },
).withOutMessagePolicy({
  fold: ApplicationDefinition.makeOutMessageFold(EditionRadioGroupBlock, {
    Selected: ({ value }) =>
      ApplicationDefinition.makeStep(
        stepMachine(
          Message.SelectedEdition({
            isShippingRequired: value === HARDCOVER_EDITION,
          }),
        ),
      ),
  }),
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [EditionRadioGroupBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
