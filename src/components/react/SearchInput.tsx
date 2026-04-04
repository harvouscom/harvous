import React, { useState } from 'react';

interface SearchInputProps {
  className?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onClear?: () => void;
  /** Applied to the input element (e.g. touchAction for mobile focus) */
  inputStyle?: React.CSSProperties;
}

export default function SearchInput({
  className = "",
  placeholder = "Find",
  value = "",
  onChange,
  onClear,
  inputStyle,
}: SearchInputProps) {
  const [query, setQuery] = useState(value);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    onChange?.(newValue);
  };

  const handleClear = () => {
    setQuery("");
    onChange?.("");
    onClear?.();
  };

  return (
    <div className={`search-input ${className}`}>
      {/* Search Icon */}
      <svg width="16" height="16" className="search-input__icon" viewBox="0 0 512 512">
        <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>
      </svg>
      
      {/* Input */}
      <input 
        type="text" 
        role="searchbox"
        aria-label="Find"
        className="search-input__field" 
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        style={inputStyle}
      />
      
      {/* Clear Icon */}
      {query && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear find"
          className="search-input__clear"
        >
          <svg width="16" height="16" viewBox="0 0 384 512" aria-hidden="true">
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
          </svg>
        </button>
      )}
    </div>
  );
}
