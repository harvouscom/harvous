/**
 * Standalone search input for the prototype shell.
 * Does not import FindSearchInput or any SPA-styled component.
 */
import Icon from '@/components/react/Icon';

interface PrototypeSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export default function PrototypeSearchInput({
  value,
  onChange,
  placeholder = 'Search notes…',
  autoFocus,
  onKeyDown,
}: PrototypeSearchInputProps) {
  return (
    <div className="proto-search-input-wrap">
      <Icon name="magnifying-glass" size={16} className="proto-search-input-wrap__icon" />
      <input
        className="proto-search-input"
        type="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}
