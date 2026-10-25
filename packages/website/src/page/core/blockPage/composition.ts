import { Block } from 'foldkit'

import { Message } from './message'
import { Model } from './model'

export const BlockPageComposition = Block.makeDefinition('BlockPage', {
  Model,
  Message,
}).makeComposition()
export type BlockPageViewBuilder = Block.ViewBuilderFor<
  typeof BlockPageComposition
>
