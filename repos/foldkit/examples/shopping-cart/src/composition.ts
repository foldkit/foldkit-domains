import type { Block } from 'foldkit'

import { products } from './data/products'
import { ApplicationDefinition } from './definition'
import { Cart } from './domain'
import { ProductsBlock } from './page'

export const ProductsPageBinding = ApplicationDefinition.makeBinding(
  ProductsBlock,
  {
    field: 'productsPage',
    init: { contextToArgs: () => [products] },
  },
).withOutMessagePolicy({
  fold: ApplicationDefinition.makeOutMessageFold(ProductsBlock, {
    AddedToCart: ({ item }) =>
      ApplicationDefinition.makeFieldsStep(() => ({
        cart: Cart.addItem(item),
      })),
    IncrementedQuantity: ({ itemId }) =>
      ApplicationDefinition.makeFieldsStep(() => ({
        cart: Cart.incrementQuantity(itemId),
      })),
    DecrementedQuantity: ({ itemId }) =>
      ApplicationDefinition.makeFieldsStep(() => ({
        cart: Cart.decrementQuantity(itemId),
      })),
  }),
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [ProductsPageBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
