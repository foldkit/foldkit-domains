import { Array, Option, pipe } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { SubmitApplication } from './command'
import {
  ApplicationComposition,
  EducationBinding,
  PersonalInfoBinding,
  SkillsBinding,
  WorkHistoryBinding,
} from './composition'
import { ApplicationDefinition } from './definition'
import { Step } from './domain'
import { Message } from './message'
import { type Model, Submission } from './model'
import { isComplete as isEducationComplete } from './step/education/update'
import { isComplete as isPersonalInfoComplete } from './step/personalInfo/update'
import { isComplete as isSkillsComplete } from './step/skills/update'
import { isComplete as isWorkHistoryComplete } from './step/workHistory/update'

const isApplicationComplete = (model: typeof Model.Type): boolean =>
  isPersonalInfoComplete(model.personalInfo) &&
  isWorkHistoryComplete(model.workHistory) &&
  isEducationComplete(model.education) &&
  isSkillsComplete(model.skills)

const toNextStep = (current: typeof Step.Step.Type): typeof Step.Step.Type =>
  pipe(
    Step.all,
    Array.get(Step.indexOf(current) + 1),
    Option.getOrElse(() => current),
  )

const toPreviousStep = (
  current: typeof Step.Step.Type,
): typeof Step.Step.Type =>
  pipe(
    Step.all,
    Array.get(Step.indexOf(current) - 1),
    Option.getOrElse(() => current),
  )

const markSubmitAttempted = ApplicationDefinition.makeFieldsStep(() => ({
  isSubmitAttempted: () => true,
}))

const submitWhenComplete = ApplicationDefinition.makeStep(model => {
  if (isApplicationComplete(model)) {
    return {
      model: modifyFields(model, {
        submission: () => Submission.Submitting(),
      }),
      commands: [SubmitApplication()],
    }
  }

  return { model }
})

export const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedNext: () => ({
      model: modifyFields(model, { currentStep: toNextStep }),
    }),

    ClickedPrevious: () => ({
      model: modifyFields(model, { currentStep: toPreviousStep }),
    }),

    ToggledPreview: () => ({
      model: modifyFields(model, { isPreviewVisible: isVisible => !isVisible }),
    }),

    ClickedSubmit: () =>
      Update.combineSteps(model, [
        markSubmitAttempted,
        PersonalInfoBinding.requestRevealErrors(),
        WorkHistoryBinding.requestRevealErrors(),
        EducationBinding.requestRevealErrors(),
        SkillsBinding.requestRevealErrors(),
        submitWhenComplete,
      ]),

    SucceededSubmitApplication: () => ({
      model: modifyFields(model, {
        submission: () => Submission.SubmitSuccess(),
      }),
    }),

    FailedSubmitApplication: ({ error }) => ({
      model: modifyFields(model, {
        submission: () => Submission.SubmitError({ error }),
      }),
    }),
  }),
)
