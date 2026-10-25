import { Option } from 'effect'

import {
  EducationEntryDefinition,
  GraduationYearListboxBlock,
} from './definition'

export const GraduationYearListboxBinding =
  EducationEntryDefinition.makeBinding(GraduationYearListboxBlock, {
    field: 'graduationYearListbox',
    init: {
      contextToArgs: entryId => [{ id: `${entryId}-graduation-year` }],
    },
  }).withOutMessagePolicy({
    fold: EducationEntryDefinition.makeOutMessageFold(
      GraduationYearListboxBlock,
      {
        Selected: ({ value }) =>
          EducationEntryDefinition.makeFieldsStep(() => ({
            maybeGraduationYear: () => Option.some(value),
          })),
      },
    ),
  })

export const EducationEntryComposition =
  EducationEntryDefinition.makeComposition({
    bindings: [GraduationYearListboxBinding],
  })
