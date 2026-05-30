import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';

const PROMPT_WIDTH = 320;
const PROMPT_OFFSET = 8;
const VIEWPORT_MARGIN = 8;

interface UrlLinkPromptUIProps {
  rect: { top: number; left: number; bottom: number; right: number; width: number };
  initialHref: string;
  mode: 'create' | 'edit';
  onSubmit: (href: string) => void;
  onRemove?: () => void;
  onCancel: () => void;
}

export default function UrlLinkPromptUI({
  rect,
  initialHref,
  mode,
  onSubmit,
  onRemove,
  onCancel,
}: UrlLinkPromptUIProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [value, setValue] = useState(initialHref);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const h = containerRef.current?.offsetHeight ?? 48;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    let top = rect.bottom + PROMPT_OFFSET;
    if (top + h + VIEWPORT_MARGIN > vh) top = rect.top - h - PROMPT_OFFSET;
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
    let left = rect.left + rect.width / 2 - PROMPT_WIDTH / 2;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (left + PROMPT_WIDTH + VIEWPORT_MARGIN > vw) left = vw - PROMPT_WIDTH - VIEWPORT_MARGIN;
    setPos({ top, left });
  }, [rect]);

  useEffect(() => {
    // Delay slightly so we win the focus race against the toolbar button's
    // post-click `editor.commands.focus()` (fires on setTimeout(0)).
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 16);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      ref={containerRef}
      className="url-link-prompt"
      data-harvous-bottom-sheet-floating=""
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: PROMPT_WIDTH,
        zIndex: 99999,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
        className="url-link-prompt__form"
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          className="url-link-prompt__input"
          placeholder="Paste or type a link"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button type="submit" className="url-link-prompt__btn url-link-prompt__btn--primary" aria-label={mode === 'edit' ? 'Save link' : 'Add link'}>
          <Icon name="arrow-right" size={14} aria-hidden />
        </button>
        {onRemove ? (
          <button type="button" className="url-link-prompt__btn url-link-prompt__btn--danger" onClick={onRemove} aria-label="Remove link">
            <Icon name="trash-can" size={14} aria-hidden />
          </button>
        ) : null}
        <button type="button" className="url-link-prompt__btn" onClick={onCancel} aria-label="Cancel">
          <Icon name="xmark" size={14} aria-hidden />
        </button>
      </form>
    </div>
  );
}
