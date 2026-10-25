import {
  allValid,
  anyInvalid,
  makeRules,
  validate,
} from 'foldkit/fieldValidation'
import { modifyFields } from 'foldkit/struct'

import { revealFieldErrors } from '../../validation'
import { SkillsEntryComposition } from './composition'
import { Message, type Model, OutMessage } from './definition'

export const nameRules = makeRules({
  required: 'Skill name is required',
})

const validateName = validate(nameRules)

export const update = SkillsEntryComposition.makeUpdate((model, message) =>
  Message.match(message, {
    UpdatedName: ({ value }) => ({
      model: modifyFields(model, { name: () => validateName(value) }),
    }),

    RequestedRevealErrors: () => ({
      model: modifyFields(model, { name: revealFieldErrors(nameRules) }),
    }),

    ClickedRemoveSelf: () => ({ model, outMessage: OutMessage.Removed() }),
  }),
)

export const hasErrors = (entry: typeof Model.Type) => anyInvalid([entry.name])

export const isComplete = (entry: typeof Model.Type) =>
  allValid([[entry.name, nameRules]])
