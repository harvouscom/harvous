import React, { useState, useMemo } from 'react';
import SearchInput from './SearchInput';

interface AddableItem {
  id: string;
  title: string;
  color?: string;
  isPublic?: boolean;
  subtitle?: string;
  [key: string]: any; // Allow additional properties
}

interface AddToSectionProps {
  allItems: AddableItem[];
  currentItems: AddableItem[];
  onItemSelect: (itemId: string) => void;
  isLoading?: boolean;
  loadingText?: string;
  title?: string;
  placeholder?: string;
  emptyMessage?: string;
  itemRenderer?: (item: AddableItem, onClick: () => void) => React.ReactNode;
}

export default function AddToSection({
  allItems,
  currentItems,
  onItemSelect,
  isLoading = false,
  loadingText = "Adding...",
  title = "Add to",
  placeholder = "Search to add...",
  emptyMessage = "No items found",
  itemRenderer
}: AddToSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter available items (not already associated)
  const availableItems = useMemo(() => {
    return allItems.filter(item => 
      !currentItems.some(current => current.id === item.id)
    );
  }, [allItems, currentItems]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return availableItems;
    
    return availableItems.filter(item =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [availableItems, searchQuery]);

  const handleItemClick = (itemId: string) => {
    onItemSelect(itemId);
    setSearchQuery(""); // Clear search after selection
  };

  // Default item renderer for threads
  const defaultItemRenderer = (item: AddableItem, onClick: () => void) => (
    <div
      key={item.id}
      onClick={onClick}
      className="flex-row p-3 rounded-lg border cursor-pointer transition-colors"
      style={{
        borderColor: 'var(--color-gray)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-gray)';
        e.currentTarget.style.backgroundColor = 'var(--color-snow-white)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-gray)';
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {/* Color Indicator */}
      {item.color && (
        <div 
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: `var(--color-${item.color})` }}
        />
      )}
      
      {/* Item Info */}
      <div className="flex-fill">
        <div className="font-medium text-truncate" style={{ color: 'var(--color-deep-grey)' }}>
          {item.title}
        </div>
        {item.subtitle && (
          <div className="text-xs" style={{ color: 'var(--color-pebble-grey)' }}>
            {item.subtitle}
          </div>
        )}
        {item.isPublic !== undefined && (
          <div className="text-xs" style={{ color: 'var(--color-pebble-grey)' }}>
            {item.isPublic ? 'Public' : 'Private'}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border" style={{ borderColor: 'var(--color-gray)' }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-stone-grey)' }}>{title}</h3>
      
      {/* Search Input */}
      <div className="mb-4">
        <SearchInput
          placeholder={placeholder}
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* Item Results */}
      {searchQuery && (
        <div className="max-h-48 scroll-y space-y-2">
          {filteredItems.length === 0 ? (
            <div className="text-center py-4 text-sm" style={{ color: 'var(--color-pebble-grey)' }}>
              {emptyMessage} matching "{searchQuery}"
            </div>
          ) : (
            filteredItems.map(item => 
              itemRenderer 
                ? itemRenderer(item, () => handleItemClick(item.id))
                : defaultItemRenderer(item, () => handleItemClick(item.id))
            )
          )}
        </div>
      )}

      {isLoading && (
        <div className="mt-2 text-xs" style={{ color: 'var(--color-pebble-grey)' }}>{loadingText}</div>
      )}
    </div>
  );
}
