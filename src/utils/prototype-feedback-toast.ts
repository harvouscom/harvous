export const PROTO_FEEDBACK_TOAST_EVENT = 'harvous-prototype-feedback-toast';

export type PrototypeFeedbackToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface PrototypeFeedbackToastDetail {
  message: string;
  variant?: PrototypeFeedbackToastVariant;
}

export function showPrototypeFeedbackToast(
  message: string,
  variant: PrototypeFeedbackToastVariant = 'success',
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<PrototypeFeedbackToastDetail>(PROTO_FEEDBACK_TOAST_EVENT, {
      detail: { message, variant },
    }),
  );
}
