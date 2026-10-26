import { Block } from 'foldkit'

import { makeComposition } from './definition'

export const ApplicationComposition = makeComposition()
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
