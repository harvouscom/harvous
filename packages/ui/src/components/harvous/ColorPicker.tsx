import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';

interface ColorPickerProps {
  selectedColor?: string;
  onColorSelect: (color: string) => void;
  className?: string;
}

const HARVOUS_COLORS = [
  { name: 'blessed-blue', label: 'Blue', bg: 'bg-blue-500', ring: 'ring-blue-500' },
  { name: 'blessed-green', label: 'Green', bg: 'bg-green-500', ring: 'ring-green-500' },
  { name: 'blessed-purple', label: 'Purple', bg: 'bg-purple-500', ring: 'ring-purple-500' },
  { name: 'blessed-orange', label: 'Orange', bg: 'bg-orange-500', ring: 'ring-orange-500' },
  { name: 'blessed-red', label: 'Red', bg: 'bg-red-500', ring: 'ring-red-500' },
  { name: 'blessed-yellow', label: 'Yellow', bg: 'bg-yellow-500', ring: 'ring-yellow-500' },
  { name: 'blessed-pink', label: 'Pink', bg: 'bg-pink-500', ring: 'ring-pink-500' },
  { name: 'paper', label: 'Paper', bg: 'bg-gray-100', ring: 'ring-gray-400' },
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  selectedColor,
  onColorSelect,
  className
}) => {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <h3 className="text-sm font-medium mb-3">Choose Color</h3>
        <div className="grid grid-cols-4 gap-2">
          {HARVOUS_COLORS.map((color) => (
            <Button
              key={color.name}
              variant="ghost"
              size="sm"
              className={cn(
                "h-12 w-full rounded-lg border-2 transition-all",
                color.bg,
                selectedColor === color.name 
                  ? `ring-2 ${color.ring} border-white` 
                  : 'border-transparent hover:border-white/50'
              )}
              onClick={() => onColorSelect(color.name)}
            >
              <span className="sr-only">{color.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
