import { Listbox } from '@foldkit/ui'

import { DataSource } from '../shared/dataSource'

export const DATA_SOURCE_CONTROL_ID = 'data-source'
export const DataSourceControlBlock = Listbox.makeBlock<DataSource>()
