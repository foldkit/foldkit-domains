import { Listbox } from '@foldkit/ui'

import { SearchMode } from '../shared/searchMode'

export const SEARCH_MODE_CONTROL_ID = 'search-mode'
export const SearchModeControlBlock = Listbox.makeBlock<SearchMode>()
