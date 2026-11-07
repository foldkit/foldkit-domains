import { Effect, Layer } from 'effect'
import { Query } from 'foldkit/experimental'

import { Dialog, Listbox, VirtualList } from '@foldkit/ui'

import { ApplicationBlock } from './block'
import { EffectsLayer } from './command'
import { ApplicationComposition } from './composition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const layer = ApplicationBlock.makeLayer(
  Effect.gen(function* () {
    const children = yield* ApplicationComposition.acquireChildren()

    return {
      children,
      init,
      update,
      view,
      EffectsLayer,
    }
  }),
).pipe(
  Layer.provide(
    Layer.mergeAll(Query.layer, VirtualList.layer, Listbox.layer, Dialog.layer),
  ),
)
