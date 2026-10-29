import { Schema } from 'effect'

export const SearchMode = Schema.Literals(['Demo', 'Live'])
export type SearchMode = typeof SearchMode.Type
