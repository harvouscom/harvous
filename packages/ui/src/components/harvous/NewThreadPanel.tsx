import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { ColorPicker } from './ColorPicker';
import { X, Plus, Hash } from 'lucide-react';
import { Space } from '@harvous/types';
import { cn } from '../../lib/utils';

interface NewThreadPanelProps {
  onClose?: () => void;
  currentSpace?: Space;
  spaces?: Space[];
  className?: string;
}

export const NewThreadPanel: React.FC<NewThreadPanelProps> = ({
  onClose,
  currentSpace,
  spaces = [],
  className
}) => {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [selectedSpace, setSelectedSpace] = useState(currentSpace?.id || '');
  const [selectedColor, setSelectedColor] = useState('blessed-blue');
  const [isPublic, setIsPublic] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle thread creation
    console.log('Creating thread:', {
      title,
      subtitle,
      spaceId: selectedSpace,
      color: selectedColor,
      isPublic
    });
    onClose?.();
  };

  return (
    <Card className={cn("w-full h-full flex flex-col", className)}>
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">New Thread</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col min-h-0">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <div className="space-y-4 flex-1">
            {/* Title Input */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Thread Title
              </label>
              <Input
                placeholder="Thread title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full"
                required
              />
            </div>

            {/* Subtitle Input */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Subtitle (Optional)
              </label>
              <Input
                placeholder="Thread subtitle..."
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Space Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Space (Optional)
              </label>
              <Select value={selectedSpace} onValueChange={setSelectedSpace}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a space" />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((space) => (
                    <SelectItem key={space.id} value={space.id}>
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: `var(--color-${space.color || 'blessed-blue'})` }}
                        />
                        <span>{space.title}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Color Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Thread Color
              </label>
              <ColorPicker
                selectedColor={selectedColor}
                onColorSelect={setSelectedColor}
                className="max-w-md"
              />
            </div>

            {/* Public Toggle */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="isPublic" className="text-sm">
                Make this thread public
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              <Hash className="h-4 w-4 mr-2" />
              Create Thread
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
