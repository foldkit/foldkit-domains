import { Record } from 'effect'

import { ComingFromReactComposition } from './composition'
import { Message } from './message'

export const update = ComingFromReactComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ToggledFaq: ({ id, isOpen }) => ({ model: Record.set(model, id, isOpen) }),
  }),
)
