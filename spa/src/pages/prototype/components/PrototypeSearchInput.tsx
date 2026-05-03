/**
 * Standalone search input for the prototype shell.
 * Does not import FindSearchInput or any SPA-styled component.
 */
import { MagnifyingGlass } from '@phosphor-icons/react';

interface PrototypeSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function PrototypeSearchInput({
  value,
  onChange,
  placeholder = 'Search notes…',
  autoFocus,
}: PrototypeSearchInputProps) {
  return (
    <div className="proto-search-input-wrap">
      <MagnifyingGlass className="proto-search-input-wrap__icon" aria-hidden="true" />
      <input
        className="proto-search-input"
        type="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}
