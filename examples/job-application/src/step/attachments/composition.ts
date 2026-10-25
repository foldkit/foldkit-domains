import { Array, Option } from 'effect'
import type { Block } from 'foldkit'

import { FileDropBlock } from '@foldkit/ui'

import { AttachmentsDefinition } from './definition'

export const ResumeDropBinding = AttachmentsDefinition.makeBinding(
  FileDropBlock,
  {
    field: 'resumeDrop',
    init: { contextToArgs: () => [{ id: 'attachments-resume' }] },
  },
).withOutMessagePolicy({
  fold: AttachmentsDefinition.makeOutMessageFold(FileDropBlock, {
    ReceivedFiles: ({ files }) =>
      AttachmentsDefinition.makeFieldsStep(() => ({
        maybeResume: maybeResume =>
          Option.orElse(Array.head(files), () => maybeResume),
      })),
    RejectedNonFiles: AttachmentsDefinition.makeNoopStep,
  }),
})

export const AdditionalFilesDropBinding = AttachmentsDefinition.makeBinding(
  FileDropBlock,
  {
    field: 'additionalFilesDrop',
    init: { contextToArgs: () => [{ id: 'attachments-additional' }] },
  },
).withOutMessagePolicy({
  fold: AttachmentsDefinition.makeOutMessageFold(FileDropBlock, {
    ReceivedFiles: ({ files }) =>
      AttachmentsDefinition.makeFieldsStep(() => ({
        additionalFiles: Array.appendAll(files),
      })),
    RejectedNonFiles: AttachmentsDefinition.makeNoopStep,
  }),
})

export const AttachmentsComposition = AttachmentsDefinition.makeComposition({
  bindings: [ResumeDropBinding, AdditionalFilesDropBinding],
})
export type AttachmentsViewBuilder = Block.ViewBuilderFor<
  typeof AttachmentsComposition
>
