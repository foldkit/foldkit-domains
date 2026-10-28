import { modifyFields } from 'foldkit/struct'

import { IssueDraft } from '../domain'
import { makeStep } from './definition'
import { SaveState } from './model'

export const editDraftStep = (
  transformDraft: (draft: typeof IssueDraft.Type) => typeof IssueDraft.Type,
) =>
  makeStep(model => ({
    model: SaveState.guards.Saving(model.saveState)
      ? model
      : modifyFields(model, { draft: transformDraft }),
  }))
