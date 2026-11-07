import { Schema } from 'effect'
import { Block } from 'foldkit'
import { Url } from 'foldkit/url'

import { Message } from './message'
import { Model } from './model'
import { DomainsClient } from './rpc'

export const ApplicationKey = Symbol('Application')
export const ApplicationBlock = Block.make('Application', {
  key: ApplicationKey,
  InitArgs: Schema.Tuple([Url]),
  view: { kind: 'Document' },
  effects: { services: [DomainsClient] },
  Model,
  Message,
})

export const {
  makeCommand,
  makeCommandsStep,
  makeFieldsStep,
  makeNoopStep,
  makeStep,
  makeOutMessageFold,
  makeRequiredFieldBinding,
  makeComposition,
} = ApplicationBlock
