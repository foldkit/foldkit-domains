import { Schema } from 'effect'
import { Block } from 'foldkit'
import type { FromAssemblyWithView as RealHeader, FromAssembly as FailedUnified } from 'foldkit/block'
import type { FromAssemblyWithView as FakeHeader } from '../shared/fake-header'
import { PublicInferred } from '../shared/header-barrel'

const Model = Schema.Struct({ count: Schema.Number })
const Composition = Block.makeDefinition('Child', { Model }).makeComposition()
const prepare = () => Composition.prepareBlock({})
const prepareOther = () => Composition.prepareBlock({})
const FakeComposition = { prepareBlock: () => Composition.prepareBlock({}) }
const prepareFake = () => FakeComposition.prepareBlock()
const Unified: FailedUnified<typeof Model, typeof prepare> = Block.assemble(prepare)
const NonQuery: RealHeader<typeof Model, ReturnType<typeof prepare>> = Block.assemble(prepare)
const CallTypes: RealHeader<typeof Model, typeof prepare> = Block.assemble<unknown>(prepare)
const Inferred = Block.assemble(prepare)
const Fake: FakeHeader<typeof Model, typeof prepare> = Block.assemble(prepare)
const FakeProducer: RealHeader<typeof Model, typeof prepareFake> = Block.assemble(prepareFake)
const WrongProducer: RealHeader<typeof Model, typeof prepareOther> = Block.assemble(prepare)
const WrongArity: RealHeader<typeof Model> = Block.assemble(prepare)
const ExtraArity: RealHeader<typeof Model, typeof prepare, typeof prepareOther> = Block.assemble(prepare)
const WrongInit: RealHeader<typeof Model, typeof prepare> = Block.assemble(prepareOther)
const Satisfies = Block.assemble(prepare) satisfies RealHeader<typeof Model, typeof prepare>
const Cast = Block.assemble(prepare) as RealHeader<typeof Model, typeof prepare>
const prepareWrapped = () => Composition.prepareBlock({}) as unknown
const WrappedProducer: RealHeader<typeof Model, typeof prepareWrapped> = Block.assemble(prepareWrapped)
type RealHeaderAlias = unknown
const UnknownAlias: RealHeaderAlias = Block.assemble(prepare)
namespace FakeBlock {
  export type FromAssemblyWithView<Model, Producer> = Model & Producer
}
const QualifiedFake: FakeBlock.FromAssemblyWithView<typeof Model, typeof prepare> = Block.assemble(prepare)
export const Parent = Schema.Struct({
  unified: Unified.Model,
  nonQuery: NonQuery.Model,
  callTypes: CallTypes.Model,
  inferred: Inferred.Model,
  fake: Fake.Model,
  fakeProducer: FakeProducer.Model,
  wrongProducer: WrongProducer.Model,
  wrongArity: WrongArity.Model,
  extraArity: ExtraArity.Model,
  wrongInit: WrongInit.Model,
  satisfies: Satisfies.Model,
  cast: Cast.Model,
  wrappedProducer: WrappedProducer.Model,
  alias: UnknownAlias.Model,
  qualifiedFake: QualifiedFake.Model,
  imported: Schema.Option(Schema.Array(PublicInferred.Model)),
})
export const shadowed = <RealHeader>() => {
  const Child: RealHeader<typeof Model, typeof prepare> = Block.assemble(prepare)
  return Schema.Struct({ child: Child.Model })
}
