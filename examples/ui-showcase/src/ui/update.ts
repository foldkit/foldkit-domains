import { Array, Number, Option } from 'effect'
import { modifyFields } from 'foldkit/struct'

import {
  AnimationDemoBinding,
  DialogAnimatedDemoBinding,
  DialogDemoBinding,
  MobileMenuDialogBinding,
  NestedDialogChildDemoBinding,
  NestedDialogParentDemoBinding,
  OverlayDialogDemoBinding,
  ToastDemoBinding,
  UiComposition,
  VirtualListDemoBinding,
  VirtualListVariableDemoBinding,
} from './composition'
import { Message } from './message'
import { ROW_COUNT as VIRTUAL_LIST_ROW_COUNT } from './virtualList'

export const update = UiComposition.makeUpdate((model, message) =>
  Message.match(message, {
    RequestedOpenMobileMenu: () => MobileMenuDialogBinding.requestOpen()(model),

    RequestedCloseMobileMenu: () =>
      MobileMenuDialogBinding.requestClose()(model),

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

    ToggledDisclosureBasicDemo: ({ isOpen }) => ({
      model: modifyFields(model, {
        isDisclosureBasicDemoOpen: () => isOpen,
      }),
    }),

    ToggledDisclosureAnimatedDemo: ({ isOpen }) => ({
      model: modifyFields(model, {
        isDisclosureAnimatedDemoOpen: () => isOpen,
      }),
    }),

    ToggledDisclosureCollapsedPreviewDemo: ({ isOpen }) => ({
      model: modifyFields(model, {
        isDisclosureCollapsedPreviewDemoOpen: () => isOpen,
      }),
    }),

    ClickedRemoveFileDropDemoFile: ({ fileIndex }) => ({
      model: modifyFields(model, {
        fileDropBasicDemoFiles: () =>
          Array.remove(model.fileDropBasicDemoFiles, fileIndex),
      }),
    }),

    ToggledSwitchDemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isSwitchDemoChecked: () => isChecked,
      }),
    }),

    ClickedShowInfoToast: () =>
      ToastDemoBinding.requestShow({
        variant: 'Info',
        payload: {
          title: 'Changes saved',
          maybeDescription: Option.some('Your preferences have been updated.'),
        },
      })(model),

    ClickedShowSuccessToast: () =>
      ToastDemoBinding.requestShow({
        variant: 'Success',
        payload: {
          title: 'Uploaded successfully',
          maybeDescription: Option.some('kit-manual.pdf is now available.'),
        },
      })(model),

    ClickedShowWarningToast: () =>
      ToastDemoBinding.requestShow({
        variant: 'Warning',
        payload: {
          title: 'Network slow',
          maybeDescription: Option.some(
            'Some assets are loading over a weak connection.',
          ),
        },
      })(model),

    ClickedShowErrorToast: () =>
      ToastDemoBinding.requestShow({
        variant: 'Error',
        payload: {
          title: 'Failed to save',
          maybeDescription: Option.some('Check your connection and try again.'),
        },
      })(model),

    ClickedShowStickyToast: () =>
      ToastDemoBinding.requestShow({
        variant: 'Info',
        payload: {
          title: 'Review pending',
          maybeDescription: Option.some(
            'Action required. This stays until dismissed.',
          ),
        },
        sticky: true,
      })(model),

    ClickedDismissAllToasts: () => ToastDemoBinding.requestDismissAll()(model),

    ToggledAnimationDemo: () =>
      model.animationDemo.isShowing
        ? AnimationDemoBinding.requestHide()(model)
        : AnimationDemoBinding.requestShow()(model),

    ClickedVirtualListScrollToMiddle: () =>
      VirtualListDemoBinding.requestScrollToIndex(
        Math.floor(VIRTUAL_LIST_ROW_COUNT / 2),
      )(model),

    ClickedVirtualListVariableScrollToMiddle: () =>
      VirtualListVariableDemoBinding.requestScrollToIndex(
        Math.floor(VIRTUAL_LIST_ROW_COUNT / 2),
      )(model),
  }),
)
