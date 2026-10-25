import { Block } from 'foldkit'

import { Message, OutMessage } from './message'
import { Model } from './model'

export const LoggedInComposition = Block.makeDefinition('LoggedIn', {
  Model,
  Message,
  OutMessage,
}).makeComposition()
export type LoggedInViewBuilder = Block.ViewBuilderFor<
  typeof LoggedInComposition
>
