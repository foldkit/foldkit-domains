import { Array, Number, Option } from 'effect'
import { modifyFields } from 'foldkit/struct'

import { UiComposition } from './composition'
import {
  AnimationDemoBinding,
  DialogAnimatedDemoBinding,
  DialogDemoBinding,
  HoverIntentMenuDemoBinding,
  NestedDialogChildDemoBinding,
  NestedDialogParentDemoBinding,
  OverlayDialogDemoBinding,
  ToastDemoBinding,
  VirtualListDemoBinding,
  VirtualListVariableDemoBinding,
} from './composition'
import { ROW_COUNT as VIRTUAL_LIST_ROW_COUNT } from './demo/virtualListData'
import { Message } from './message'
import {
  VirtualListChatDemoBinding,
  prependVirtualListChatMessages,
  updateVirtualListChatMessages,
} from './virtualListChat'

export const update = UiComposition.makeUpdate((model, message) =>
  Message.match(message, {
    UpdatedInputDemoValue: ({ value }) => ({
      model: modifyFields(model, { inputDemoValue: () => value }),
    }),

    UpdatedTextareaDemoValue: ({ value }) => ({
      model: modifyFields(model, { textareaDemoValue: () => value }),
    }),

    UpdatedFieldsetInputValue: ({ value }) => ({
      model: modifyFields(model, { fieldsetInputValue: () => value }),
    }),

    UpdatedFieldsetTextareaValue: ({ value }) => ({
      model: modifyFields(model, { fieldsetTextareaValue: () => value }),
    }),

    UpdatedSelectDemoValue: ({ value }) => ({
      model: modifyFields(model, { selectDemoValue: () => value }),
    }),

    ToggledFieldsetCheckboxDemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isFieldsetCheckboxDemoChecked: () => isChecked,
      }),
    }),

    ClickedButtonDemo: () => ({
      model: modifyFields(model, {
        buttonClickCount: Number.increment,
      }),
    }),

    ToggledCheckboxBasicDemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isCheckboxBasicDemoChecked: () => isChecked,
      }),
    }),

    ToggledCheckboxAllDemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isCheckboxOptionADemoChecked: () => isChecked,
        isCheckboxOptionBDemoChecked: () => isChecked,
      }),
    }),

    ToggledCheckboxOptionADemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isCheckboxOptionADemoChecked: () => isChecked,
      }),
    }),

    ToggledCheckboxOptionBDemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isCheckboxOptionBDemoChecked: () => isChecked,
      }),
    }),

    ClickedDeleteProject: () =>
      NestedDialogChildDemoBinding.requestOpen()(model),

    ClickedOpenDialog: () => DialogDemoBinding.requestOpen()(model),

    ClickedOpenAnimatedDialog: () =>
      DialogAnimatedDemoBinding.requestOpen()(model),

    ClickedEditFilters: () => OverlayDialogDemoBinding.requestOpen()(model),

    ClickedOpenProjectSettings: () =>
      NestedDialogParentDemoBinding.requestOpen()(model),

    ToggledDisclosureDemo: ({ isOpen }) => ({
      model: modifyFields(model, { isDisclosureDemoOpen: () => isOpen }),
    }),

    ToggledDisclosureCollapsedPreviewDemo: ({ isOpen }) => ({
      model: modifyFields(model, {
        isDisclosureCollapsedPreviewDemoOpen: () => isOpen,
      }),
    }),

    ToggledSwitchDemo: ({ isChecked }) => ({
      model: modifyFields(model, { isSwitchDemoChecked: () => isChecked }),
    }),

    ClickedHoverIntentMenuItem: () =>
      HoverIntentMenuDemoBinding.requestClose()(model),

    ClickedShowInfoToast: () =>
      ToastDemoBinding.requestShow({
        variant: 'Info',
        payload: {
          title: 'Preferences updated',
          maybeDescription: Option.some('Your changes are saved.'),
        },
      })(model),

    ClickedShowSuccessToast: () =>
      ToastDemoBinding.requestShow({
        variant: 'Success',
        payload: {
          title: 'Uploaded',
          maybeDescription: Option.some('kit-manual.pdf is now available.'),
        },
      })(model),

    ClickedShowErrorToast: () =>
      ToastDemoBinding.requestShow({
        variant: 'Error',
        payload: {
          title: 'Save failed',
          maybeDescription: Option.some('Check your connection and try again.'),
        },
      })(model),

    ClickedShowStickyToast: () =>
      ToastDemoBinding.requestShow({
        variant: 'Info',
        payload: {
          title: 'Action required',
          maybeDescription: Option.some('Stays visible until dismissed.'),
        },
        sticky: true,
      })(model),

    ClickedDismissAllToasts: () => ToastDemoBinding.requestDismissAll()(model),

    ClickedToggleAnimationDemo: () =>
      model.animationDemo.isShowing
        ? AnimationDemoBinding.requestHide()(model)
        : AnimationDemoBinding.requestShow()(model),

    ClickedRemoveFileDropDemoFile: ({ fileIndex }) => ({
      model: modifyFields(model, {
        fileDropBasicDemoFiles: () =>
          Array.remove(model.fileDropBasicDemoFiles, fileIndex),
      }),
    }),

    ClickedVirtualListScrollToMiddle: () =>
      VirtualListDemoBinding.requestScrollToIndex(
        Math.floor(VIRTUAL_LIST_ROW_COUNT / 2),
      )(model),

    ClickedVirtualListVariableScrollToMiddle: () =>
      VirtualListVariableDemoBinding.requestScrollToIndex(
        Math.floor(VIRTUAL_LIST_ROW_COUNT / 2),
      )(model),

    ClickedVirtualListChatPrepend: () => prependVirtualListChatMessages(model),

    ClickedVirtualListChatScrollToMessage: () =>
      VirtualListChatDemoBinding.requestScrollToKey('7', {
        alignment: 'Center',
      })(model),

    ClickedVirtualListChatAppend: () => {
      const nextId = model.virtualListChatNextId
      const nextMessages = Array.append(model.virtualListChatMessages, {
        id: nextId,
        body: `New message ${nextId} arrived at the end.`,
        isExpanded: nextId % 3 === 0,
      })
      return updateVirtualListChatMessages(nextMessages, nextId + 1)(model)
    },

    ClickedVirtualListChatToggleMessage: ({ messageId }) => {
      const nextMessages = Array.map(model.virtualListChatMessages, message =>
        message.id === messageId
          ? modifyFields(message, {
              isExpanded: isExpanded => !isExpanded,
            })
          : message,
      )
      return updateVirtualListChatMessages(nextMessages)(model)
    },
  }),
)
