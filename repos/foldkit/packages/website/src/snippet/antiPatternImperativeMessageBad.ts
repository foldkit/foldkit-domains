// ❌ Bad: FetchWeather tells update what to do, not what happened.

import { defineMessageUnion } from 'foldkit/message'

const Message = defineMessageUnion({
  FetchWeather: {},
})

const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    FetchWeather: () => ({ model, commands: [FetchWeather()] }),
  }),
)
