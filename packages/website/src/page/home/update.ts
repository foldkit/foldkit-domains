import { HomeComposition } from './composition'
import { Message, OutMessage } from './message'

export const update = HomeComposition.makeUpdate((model, message) =>
  Message.match(message, {
    UpdatedNewsletterEmail: ({ value }) => ({
      model,
      outMessage: OutMessage.UpdatedNewsletterEmail({ value }),
    }),
  }),
)
