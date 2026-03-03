import { toast } from 'sonner';

let initialLoadToastId: string | number | null = null;
let currentMessage: string | null = null;

const DEFAULT_MESSAGE = 'Loading your Harvous...';

export function showInitialLoadToast(message: string = DEFAULT_MESSAGE): void {
  if (initialLoadToastId != null && currentMessage !== message) {
    toast.dismiss(initialLoadToastId);
    initialLoadToastId = null;
    currentMessage = null;
  }
  if (initialLoadToastId == null) {
    currentMessage = message;
    initialLoadToastId = toast.loading(message, { icon: null });
  }
}

export function dismissInitialLoadToast(): void {
  if (initialLoadToastId != null) {
    toast.dismiss(initialLoadToastId);
    initialLoadToastId = null;
    currentMessage = null;
  }
}
