/**
 * Shared prototype search field — same markup/CSS as sidebar search.
 * Does not import FindSearchInput or any SPA-styled component.
 */
import { type RefObject } from 'react';
import Icon from '@/components/react/Icon';

interface PrototypeSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Fired when the field takes focus — for a caller that shows something once you mean to type. */
  onFocus?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  id?: string;
  ariaLabel?: string;
  /** Called when clear is pressed; defaults to `onChange('')`. */
  onClear?: () => void;
}

export default function PrototypeSearchInput({
  value,
  onChange,
  placeholder = 'Search notes…',
  autoFocus,
  onKeyDown,
  onFocus,
  inputRef,
  id,
  ariaLabel,
  onClear,
}: PrototypeSearchInputProps) {
  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
    inputRef?.current?.focus();
  };

  return (
    <div className="proto-sidebar-search__field">
      <span className="proto-sidebar-search__icon" aria-hidden>
        <Icon name="magnifying-glass" size={14} />
      </span>
      <input
        ref={inputRef}
        id={id}
        type="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder}
      />
      {value ? (
        <button type="button" className="proto-sidebar-search__clear" aria-label="Clear search" onClick={handleClear}>
          <Icon name="circle-xmark" size={15} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
