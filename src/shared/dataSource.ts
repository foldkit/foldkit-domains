import { Schema } from 'effect'

export const DataSource = Schema.Literals(['Demo', 'Live'])
export type DataSource = typeof DataSource.Type
