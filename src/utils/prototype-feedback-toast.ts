export const PROTO_FEEDBACK_TOAST_EVENT = 'harvous-prototype-feedback-toast';

export type PrototypeFeedbackToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface PrototypeFeedbackToastAction {
  label: string;
  /**
   * What the action button does. Absent means the legacy behaviour — open the support
   * sheet — which is what "Get support" on an error toast has always been.
   *
   * Carried on a CustomEvent detail, so this is a live function reference rather than
   * anything serialized; it only ever travels in-process between the caller and the
   * toast host.
   */
  onAction?: () => void;
}

export interface PrototypeFeedbackToastDetail {
  message: string;
  variant?: PrototypeFeedbackToastVariant;
  /** When true, toast stays until the user dismisses it. Defaults to true for error. */
  persistent?: boolean;
  action?: PrototypeFeedbackToastAction;
}

export interface ShowPrototypeFeedbackToastOptions {
  persistent?: boolean;
  action?: PrototypeFeedbackToastAction;
}

export function showPrototypeFeedbackToast(
  message: string,
  variant: PrototypeFeedbackToastVariant = 'success',
  options: ShowPrototypeFeedbackToastOptions = {},
): void {
  if (typeof window === 'undefined') return;
  const persistent = options.persistent ?? variant === 'error';
  window.dispatchEvent(
    new CustomEvent<PrototypeFeedbackToastDetail>(PROTO_FEEDBACK_TOAST_EVENT, {
      detail: {
        message,
        variant,
        persistent,
        action: options.action,
      },
    }),
  );
}
