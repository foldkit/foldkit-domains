import { Tuple } from 'effect'
import type { Block } from 'foldkit'

import {
  NoteDurationRadioGroupBlock,
  NotePlayerDemoDefinition,
} from './definition'
import { prependToLog } from './messageLog'

export const NoteDurationRadioGroupBinding =
  NotePlayerDemoDefinition.makeBinding(NoteDurationRadioGroupBlock, {
    field: 'noteDurationRadioGroup',
    init: { contextToArgs: () => Tuple.make({ id: 'note-duration' }) },
  }).withOutMessagePolicy({
    fold: NotePlayerDemoDefinition.makeOutMessageFold(
      NoteDurationRadioGroupBlock,
      {
        Selected: ({ value }) =>
          NotePlayerDemoDefinition.makeFieldsStep(() => ({
            noteDuration: () => value,
            messageLog: prependToLog(`Selected(${value})`),
          })),
      },
    ),
  })

export const NotePlayerDemoComposition =
  NotePlayerDemoDefinition.makeComposition({
    bindings: [NoteDurationRadioGroupBinding],
  })
export type NotePlayerDemoViewBuilder = Block.ViewBuilderFor<
  typeof NotePlayerDemoComposition
>
