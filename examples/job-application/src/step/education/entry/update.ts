import {
  allValid,
  anyInvalid,
  makeRules,
  validate,
} from 'foldkit/fieldValidation'
import { modifyFields } from 'foldkit/struct'

import { revealFieldErrors } from '../../validation'
import { EducationEntryComposition } from './composition'
import { Message, type Model, OutMessage } from './definition'

export const schoolRules = makeRules({
  required: 'School is required',
})

export const degreeRules = makeRules({
  required: 'Degree is required',
})

export const fieldOfStudyRules = makeRules({
  required: 'Field of study is required',
})

const validateSchool = validate(schoolRules)
const validateDegree = validate(degreeRules)
const validateFieldOfStudy = validate(fieldOfStudyRules)

export const update = EducationEntryComposition.makeUpdate((model, message) =>
  Message.match(message, {
    UpdatedSchool: ({ value }) => ({
      model: modifyFields(model, { school: () => validateSchool(value) }),
    }),

    UpdatedDegree: ({ value }) => ({
      model: modifyFields(model, { degree: () => validateDegree(value) }),
    }),

    UpdatedFieldOfStudy: ({ value }) => ({
      model: modifyFields(model, {
        fieldOfStudy: () => validateFieldOfStudy(value),
      }),
    }),

    ToggledCurrentlyEnrolled: ({ isChecked }) => ({
      model: modifyFields(model, { isCurrentlyEnrolled: () => isChecked }),
    }),

    RequestedRevealErrors: () => ({
      model: modifyFields(model, {
        school: revealFieldErrors(schoolRules),
        degree: revealFieldErrors(degreeRules),
        fieldOfStudy: revealFieldErrors(fieldOfStudyRules),
      }),
    }),

    ClickedRemoveSelf: () => ({ model, outMessage: OutMessage.Removed() }),
  }),
)

export const hasErrors = (entry: typeof Model.Type): boolean =>
  anyInvalid([entry.school, entry.degree, entry.fieldOfStudy])

export const isComplete = (entry: typeof Model.Type): boolean =>
  allValid([
    [entry.school, schoolRules],
    [entry.degree, degreeRules],
    [entry.fieldOfStudy, fieldOfStudyRules],
  ])
