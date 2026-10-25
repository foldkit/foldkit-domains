import { given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { FileDropBlock } from '@foldkit/ui'

import { AdditionalFilesDropBinding, ResumeDropBinding } from './composition'
import { init } from './init'
import { update } from './update'

const initialModel = init().model

const emptyFileDropView = FileDropBlock.makeView((_model, h) => h.empty)

const resumeDropMessage = (message: typeof FileDropBlock.Message.Type) =>
  ResumeDropBinding.embedView({
    slotId: 'resumeDrop',
    model: initialModel.resumeDrop,
    view: emptyFileDropView,
  }).toParentMessage(message)

const additionalFilesDropMessage = (
  message: typeof FileDropBlock.Message.Type,
) =>
  AdditionalFilesDropBinding.embedView({
    slotId: 'additionalFilesDrop',
    model: initialModel.additionalFilesDrop,
    view: emptyFileDropView,
  }).toParentMessage(message)

describe('attachments', () => {
  test('a dropped resume is stored as maybeResume', () => {
    const resume = new globalThis.File(['pdf-bytes'], 'resume.pdf', {
      type: 'application/pdf',
    })

    story(
      update,
      given(initialModel),
      message(
        resumeDropMessage(
          FileDropBlock.Message.DroppedFiles({ files: [resume] }),
        ),
      ),
      model(model => {
        expect(model.maybeResume._tag).toBe('Some')
      }),
    )
  })

  test('dropped additional files are appended to the list', () => {
    const file = new globalThis.File(['content'], 'portfolio.pdf', {
      type: 'application/pdf',
    })

    story(
      update,
      given(initialModel),
      message(
        additionalFilesDropMessage(
          FileDropBlock.Message.DroppedFiles({ files: [file] }),
        ),
      ),
      model(model => {
        expect(model.additionalFiles).toHaveLength(1)
      }),
    )
  })
})
