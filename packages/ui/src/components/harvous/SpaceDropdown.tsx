import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ChevronDown, Folder, Plus } from 'lucide-react';
import { Space } from '@harvous/types';
import { cn } from '../../lib/utils';

interface SpaceDropdownProps {
  spaces: Space[];
  currentSpace?: Space;
  onSpaceSelect?: (space: Space) => void;
  onNewSpace?: () => void;
  className?: string;
}

export const SpaceDropdown: React.FC<SpaceDropdownProps> = ({
  spaces,
  currentSpace,
  onSpaceSelect,
  onNewSpace,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSpaceSelect = (space: Space) => {
    onSpaceSelect?.(space);
    setIsOpen(false);
  };

  const getColorClasses = (color?: string) => {
    const colorMap: Record<string, string> = {
      'blessed-blue': 'bg-blue-500',
      'paper': 'bg-gray-100 text-gray-800',
      'blessed-green': 'bg-green-500',
      'blessed-purple': 'bg-purple-500',
      'blessed-orange': 'bg-orange-500',
      'blessed-red': 'bg-red-500',
      'blessed-yellow': 'bg-yellow-500',
      'blessed-pink': 'bg-pink-500',
    };
    return colorMap[color || 'blessed-blue'] || 'bg-blue-500';
  };

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full justify-between"
      >
        <div className="flex items-center space-x-2">
          {currentSpace ? (
            <>
              <div 
                className={cn(
                  "w-4 h-4 rounded-full",
                  getColorClasses(currentSpace.color)
                )}
              />
              <span>{currentSpace.title}</span>
              {currentSpace.totalItemCount && (
                <Badge variant="outline" className="text-xs">
                  {currentSpace.totalItemCount}
                </Badge>
              )}
            </>
          ) : (
            <>
              <Folder className="h-4 w-4" />
              <span>Select Space</span>
            </>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full bg-background border rounded-md shadow-lg z-50">
          <div className="p-2">
            {/* New Space Option */}
            <button
              onClick={onNewSpace}
              className="w-full flex items-center space-x-2 p-2 rounded-md hover:bg-muted transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm">New Space</span>
            </button>
            
            {/* Space List */}
            <div className="space-y-1 mt-2">
              {spaces.map((space) => (
                <button
                  key={space.id}
                  onClick={() => handleSpaceSelect(space)}
                  className={cn(
                    "w-full flex items-center space-x-2 p-2 rounded-md transition-colors",
                    currentSpace?.id === space.id 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  )}
                >
                  <div 
                    className={cn(
                      "w-3 h-3 rounded-full",
                      getColorClasses(space.color)
                    )}
                  />
                  <span className="text-sm">{space.title}</span>
                  {space.totalItemCount && (
                    <Badge 
                      variant={currentSpace?.id === space.id ? "secondary" : "outline"} 
                      className="text-xs"
                    >
                      {space.totalItemCount}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
