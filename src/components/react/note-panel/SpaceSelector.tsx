import React from 'react';
import { getThreadGradientCSS, getThreadTextColorCSS } from '@/utils/colors';
import Icon from '../Icon';

export interface SpaceSelectorProps {
  space: { 
    id: string; 
    title: string; 
    color?: string; 
    backgroundGradient?: string;
  };
  isSelected: boolean;
  onToggle: () => void;
}

/**
 * Space selector button for adding notes to a space
 */
export default function SpaceSelector({
  space,
  isSelected,
  onToggle,
}: SpaceSelectorProps) {
  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-200 pl-4 pr-0 w-full"
        style={{ 
          backgroundImage: isSelected 
            ? (space.backgroundGradient || getThreadGradientCSS(space.color || 'paper'))
            : 'var(--color-gradient-gray)'
        }}
      >
        <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125">
          <span 
            className="font-sans text-[18px] font-semibold whitespace-nowrap"
            style={{ 
              color: isSelected 
                ? getThreadTextColorCSS(space.color || 'paper')
                : 'var(--color-deep-grey)'
            }}
          >
            Add to {space.title}
          </span>
          {isSelected && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
              <Icon 
                name="check"
                size={20}
                style={{ color: getThreadTextColorCSS(space.color || 'paper') }}
              />
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

