import { Option } from 'effect'
import { initAndSet } from 'foldkit/bindingInit'

import { RoomBinding } from './composition/room'
import { type Model } from './model'

export const initRoomStep = (model: typeof Model.Type, roomId: string) =>
  initAndSet(RoomBinding, model, {
    key: roomId,
    args: [Option.some(roomId)],
  })
