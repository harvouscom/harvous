import React, { useState } from 'react';

interface SearchInputProps {
  className?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onClear?: () => void;
}

export default function SearchInput({
  className = "",
  placeholder = "Find",
  value = "",
  onChange,
  onClear
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
    <div className={`w-full search-input rounded-3xl grid items-center grid-cols-[auto_1fr_auto] py-5 px-4 gap-3 min-h-[64px] ${className}`}>
      {/* Search Icon */}
      <svg width="20" height="20" className="fill-[var(--color-pebble-grey)]" viewBox="0 0 24 24">
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>
      
      {/* Input */}
      <input 
        type="text" 
        role="searchbox"
        aria-label="Find"
        className="outline-none bg-transparent text-subtitle text-[var(--color-deep-grey)] placeholder:text-[var(--color-pebble-grey)]" 
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
      />
      
      {/* Clear Icon */}
      {query && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear find"
          className="bg-transparent border-none p-0 cursor-pointer flex items-center justify-center search-input-clear-button"
        >
          <svg 
            width="20" 
            height="20"
            className="fill-[var(--color-deep-grey)]" 
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      )}
      
      <style>{`
        .search-input {
          background: var(--color-gradient-gray);
          box-shadow: var(--shadow-small);
        }
        
        .search-input-clear-button {
          box-shadow: none !important;
        }
      `}</style>
    </div>
  );
}
