/**
 * Shared floating drag ghost for HTML5 reorder (space switcher, thread trail, study dock).
 * Clones the source card, styles it as a lifted preview, and attaches it via setDragImage.
 */

/** Must match `.proto-html5-drag-preview-shell` padding (px). */
export const HTML5_DRAG_PREVIEW_SHELL_PAD = 20;

export type Html5DragPreviewOptions = {
  /** Extra class on the clone (in addition to `proto-html5-drag-preview`). */
  className?: string;
  offsetX?: number | ((rect: DOMRect) => number);
  offsetY?: number | ((rect: DOMRect) => number);
};

export type Html5DragPreviewHandle = {
  cleanup: () => void;
};

function resolveOffset(
  value: number | ((rect: DOMRect) => number) | undefined,
  rect: DOMRect,
  fallback: number,
): number {
  if (typeof value === 'function') return value(rect);
  if (typeof value === 'number') return value;
  return fallback;
}

/** Mount a styled clone of `source` for use as a drag image. Caller must cleanup. */
export function mountHtml5DragPreview(
  source: HTMLElement,
  options: Html5DragPreviewOptions = {},
): { el: HTMLElement; cleanup: () => void } {
  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add('proto-html5-drag-preview');
  if (options.className) {
    for (const token of options.className.split(/\s+/).filter(Boolean)) {
      clone.classList.add(token);
    }
  }
  clone.removeAttribute('data-dragging');
  clone.querySelectorAll('[draggable]').forEach((node) => {
    (node as HTMLElement).draggable = false;
  });
  // Width matches source; height stays content-sized so preview padding can grow the card.
  clone.style.width = `${Math.round(rect.width)}px`;
  clone.style.minHeight = `${Math.round(rect.height)}px`;
  clone.style.height = 'auto';
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';

  const shell = document.createElement('div');
  shell.className = 'proto-html5-drag-preview-shell';
  shell.style.position = 'fixed';
  shell.style.top = '-9999px';
  shell.style.left = '-9999px';
  shell.style.pointerEvents = 'none';
  shell.style.zIndex = '9999';
  shell.setAttribute('aria-hidden', 'true');
  shell.appendChild(clone);
  document.body.appendChild(shell);

  return {
    el: shell,
    cleanup: () => {
      shell.remove();
    },
  };
}

/**
 * Attach a floating card preview to the current drag. Returns cleanup (call on dragend).
 * No-ops when `source` is missing or dataTransfer is unavailable.
 */
export function applyHtml5DragPreview(
  event: { dataTransfer: DataTransfer | null },
  source: HTMLElement | null | undefined,
  options: Html5DragPreviewOptions = {},
): Html5DragPreviewHandle | null {
  if (!source || !event.dataTransfer) return null;
  const rect = source.getBoundingClientRect();
  const preview = mountHtml5DragPreview(source, options);
  const offsetX =
    resolveOffset(options.offsetX, rect, Math.min(28, Math.round(rect.width * 0.12))) +
    HTML5_DRAG_PREVIEW_SHELL_PAD;
  const offsetY = resolveOffset(options.offsetY, rect, Math.round(rect.height / 2)) + HTML5_DRAG_PREVIEW_SHELL_PAD;
  event.dataTransfer.setDragImage(preview.el, offsetX, offsetY);
  return { cleanup: preview.cleanup };
}

/** Walk up from a trail reorder handle to the note card that should float with the cursor. */
export function resolveThreadTrailDragPreviewSource(handle: HTMLElement): HTMLElement | null {
  const step = handle.closest('.proto-thread-trail__step');
  if (step instanceof HTMLElement) {
    const body = step.querySelector(':scope > .proto-thread-trail__step-body');
    if (body instanceof HTMLElement) return body;
    return step;
  }

  // Legacy divider handles (tests / older markup): previous sibling is the step.
  const dividerLi = handle.closest('li.proto-thread-trail__reorder-divider-item');
  if (dividerLi?.previousElementSibling instanceof HTMLElement) {
    const prev = dividerLi.previousElementSibling;
    if (prev.classList.contains('proto-thread-trail__step')) {
      const body = prev.querySelector(':scope > .proto-thread-trail__step-body');
      if (body instanceof HTMLElement) return body;
      return prev;
    }
  }
  const divider = handle.closest('.proto-thread-trail__reorder-divider');
  if (divider?.previousElementSibling instanceof HTMLElement) {
    const prev = divider.previousElementSibling;
    if (prev.classList.contains('proto-thread-trail__step')) {
      const body = prev.querySelector(':scope > .proto-thread-trail__step-body');
      if (body instanceof HTMLElement) return body;
      return prev;
    }
  }
  return null;
}
