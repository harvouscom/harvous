import React, { useState, useMemo } from 'react';
import SearchInput from './SearchInput';
import ActionButton from './ActionButton';

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
    const filtered = allItems.filter(item => 
      !currentItems.some(current => current.id === item.id)
    );
    console.log('AddToSection: Available items:', filtered.length, 'allItems:', allItems.length, 'currentItems:', currentItems.length);
    return filtered;
  }, [allItems, currentItems]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return availableItems;
    
    const filtered = availableItems.filter(item =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    console.log('AddToSection: Filtered items:', filtered.length, 'for query:', searchQuery);
    return filtered;
  }, [availableItems, searchQuery]);

  const handleItemClick = (itemId: string) => {
    console.log('AddToSection: Item clicked:', itemId);
    onItemSelect(itemId);
    setSearchQuery(""); // Clear search after selection
  };

  // Default item renderer for threads
  const defaultItemRenderer = (item: AddableItem, onClick: () => void) => (
    <div
      key={item.id}
      className="relative group"
    >
      <div
        onClick={onClick}
        className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer transition-colors"
      >
        {/* Color Indicator */}
        {item.color && (
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: `var(--color-${item.color})` }}
          />
        )}
        
        {/* Item Info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {item.title}
          </div>
          {item.subtitle && (
            <div className="text-xs text-gray-500">
              {item.subtitle}
            </div>
          )}
          {item.isPublic !== undefined && (
            <div className="text-xs text-gray-500">
              {item.isPublic ? 'Public' : 'Private'}
            </div>
          )}
        </div>
      </div>
      
      {/* Add button - appears on hover */}
      <ActionButton
        variant="Add"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        disabled={isLoading}
      />
    </div>
  );

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      
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
        <div className="max-h-48 overflow-y-auto space-y-2">
          {filteredItems.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm">
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

      {/* Show available items when no search query */}
      {!searchQuery && availableItems.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-2">
          <div className="text-xs text-gray-500 mb-2">Available threads:</div>
          {availableItems.map(item => 
            itemRenderer 
              ? itemRenderer(item, () => handleItemClick(item.id))
              : defaultItemRenderer(item, () => handleItemClick(item.id))
          )}
        </div>
      )}

      {isLoading && (
        <div className="mt-2 text-xs text-gray-500">{loadingText}</div>
      )}
    </div>
  );
}
