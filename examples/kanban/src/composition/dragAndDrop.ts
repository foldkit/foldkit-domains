import { Array, Match, Option, pipe } from 'effect'
import { modifyFields } from 'foldkit/struct'

import { DragAndDropBlock } from '@foldkit/ui'
import { maybeDraggedItemId } from '@foldkit/ui/dragAndDrop'

import { SaveBoard } from '../command'
import { ApplicationDefinition } from '../definition'
import { Column } from '../domain'
import { Model } from '../model'

const findCardTitle = (
  columns: ReadonlyArray<typeof Column.Column.Type>,
  cardId: string,
): string =>
  pipe(
    columns,
    Array.flatMap(({ cards }) => cards),
    Array.findFirst(({ id }) => id === cardId),
    Option.match({
      onNone: () => cardId,
      onSome: ({ title }) => title,
    }),
  )

const findColumnName = (
  columns: ReadonlyArray<typeof Column.Column.Type>,
  columnId: string,
): string =>
  pipe(
    columns,
    Array.findFirst(({ id }) => id === columnId),
    Option.match({
      onNone: () => columnId,
      onSome: ({ name }) => name,
    }),
  )

const announceKeyboardDrag = (
  model: typeof Model.Type,
  nextDragAndDrop: typeof DragAndDropBlock.Model.Type,
): string =>
  Match.value(nextDragAndDrop.dragState).pipe(
    Match.withReturnType<string>(),
    Match.tag('KeyboardDragging', nextState => {
      const wasIdle = model.dragAndDrop.dragState._tag === 'Idle'
      if (wasIdle) {
        const title = findCardTitle(model.columns, nextState.itemId)
        return `Picked up ${title}. Use arrow keys to move within column, Tab to move between columns, Space to drop, Escape to cancel.`
      }

      if (model.dragAndDrop.dragState._tag !== 'KeyboardDragging') {
        return model.announcement
      }

      const prevState = model.dragAndDrop.dragState
      const columnName = findColumnName(
        model.columns,
        nextState.targetContainerId,
      )

      if (prevState.targetContainerId !== nextState.targetContainerId) {
        return `Moved to ${columnName}, position ${nextState.targetIndex + 1}.`
      }
      if (prevState.targetIndex !== nextState.targetIndex) {
        return `Position ${nextState.targetIndex + 1} in ${columnName}.`
      }

      return model.announcement
    }),
    Match.orElse(() => model.announcement),
  )

const screenReaderTextForDrop = (
  model: typeof Model.Type,
  outMessage: typeof DragAndDropBlock.OutMessage.Type,
): string =>
  DragAndDropBlock.OutMessage.match<string>(outMessage, {
    Reordered: ({ itemId, toContainerId, toIndex }) => {
      const title = findCardTitle(model.columns, itemId)
      const columnName = findColumnName(model.columns, toContainerId)
      return `Dropped ${title} in position ${toIndex + 1} of ${columnName}.`
    },
    Cancelled: () =>
      Option.match(maybeDraggedItemId(model.dragAndDrop), {
        onNone: () => 'Drag cancelled.',
        onSome: id => {
          const title = findCardTitle(model.columns, id)
          return `Drag cancelled, ${title} returned to original position.`
        },
      }),
  })

const foldDragAndDropOutMessage = ApplicationDefinition.makeOutMessageFold(
  DragAndDropBlock,
  {
    Reordered: (outMessage, { modelBeforeUpdate }) =>
      ApplicationDefinition.makeStep(model => {
        const { itemId, fromContainerId, toContainerId, toIndex } = outMessage
        const nextColumns = Column.reorder(
          model.columns,
          itemId,
          fromContainerId,
          toContainerId,
          toIndex,
        )
        return {
          model: modifyFields(model, {
            columns: () => nextColumns,
            announcement: () =>
              screenReaderTextForDrop(modelBeforeUpdate, outMessage),
          }),
          commands: [SaveBoard({ columns: nextColumns })],
        }
      }),
    Cancelled: (outMessage, { modelBeforeUpdate }) =>
      ApplicationDefinition.makeFieldsStep(() => ({
        announcement: () =>
          screenReaderTextForDrop(modelBeforeUpdate, outMessage),
      })),
  },
)

export const DragAndDropBinding = ApplicationDefinition.makeBinding(
  DragAndDropBlock,
  {
    read: model => Option.some(model.dragAndDrop),
    write: (model, nextDragAndDrop) =>
      modifyFields(model, {
        dragAndDrop: () => nextDragAndDrop,
        announcement: () => announceKeyboardDrag(model, nextDragAndDrop),
      }),
    init: {
      contextToArgs: () => [{ id: 'kanban' }],
      toParentFields: dragAndDrop => ({ dragAndDrop }),
    },
  },
).withOutMessagePolicy({ fold: foldDragAndDropOutMessage })
