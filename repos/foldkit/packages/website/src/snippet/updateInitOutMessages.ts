import { ApplicationDefinition } from './definition'

const foldSearchOutMessage = ApplicationDefinition.makeOutMessageFold(
  Search.SearchBlock,
  {
    RestoredQuery: ({ query }) =>
      ApplicationDefinition.makeFieldsStep(() => ({
        maybeRestoredQuery: () => Option.some(query),
      })),
  },
)

const foldEditorOutMessage = ApplicationDefinition.makeOutMessageFold(
  Editor.EditorBlock,
  {
    RestoredDraft: ({ documentId }) =>
      ApplicationDefinition.makeFieldsStep(() => ({
        maybeRestoredDocumentId: () => Option.some(documentId),
      })),
  },
)

const SearchBinding = ApplicationDefinition.makeBinding(Search.SearchBlock, {
  field: 'search',
}).withOutMessagePolicy({ fold: foldSearchOutMessage })

const EditorBinding = ApplicationDefinition.makeBinding(Editor.EditorBlock, {
  field: 'editor',
}).withOutMessagePolicy({ fold: foldEditorOutMessage })

const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [SearchBinding, EditorBinding],
})

const init = ApplicationComposition.makeInit(() => ({
  model: {
    maybeRestoredQuery: Option.none(),
    maybeRestoredDocumentId: Option.none(),
  },
  steps: [SearchBinding.requestRestore(), EditorBinding.requestRestore()],
}))
