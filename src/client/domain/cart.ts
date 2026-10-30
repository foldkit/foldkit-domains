import { Schema } from 'effect'

import type { DataSource } from '../../shared/dataSource'
import { Domain } from '../../shared/domain'

export const Cart = Schema.Array(Domain.Available)
export type Cart = typeof Cart.Type

export const Carts = Schema.Struct({
  Demo: Cart,
  Live: Cart,
})
export type Carts = typeof Carts.Type

export const forDataSource = (carts: Carts, dataSource: DataSource): Cart =>
  carts[dataSource]

export const updateForDataSource =
  (dataSource: DataSource, transform: (cart: Cart) => Cart) =>
  (carts: Carts): Carts =>
    Carts.make({
      ...carts,
      [dataSource]: transform(forDataSource(carts, dataSource)),
    })
