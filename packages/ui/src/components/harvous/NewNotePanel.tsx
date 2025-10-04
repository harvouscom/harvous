import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { X, Plus, Hash } from 'lucide-react';
import { Thread, Space } from '@harvous/types';
import { cn } from '../../lib/utils';

interface NewNotePanelProps {
  onClose?: () => void;
  currentThread?: Thread;
  currentSpace?: Space;
  threads?: Thread[];
  spaces?: Space[];
  className?: string;
}

export const NewNotePanel: React.FC<NewNotePanelProps> = ({
  onClose,
  currentThread,
  currentSpace,
  threads = [],
  spaces = [],
  className
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedThread, setSelectedThread] = useState(currentThread?.id || '');
  const [selectedSpace, setSelectedSpace] = useState(currentSpace?.id || '');
  const [isPublic, setIsPublic] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle note creation
    console.log('Creating note:', {
      title,
      content,
      threadId: selectedThread,
      spaceId: selectedSpace,
      isPublic
    });
    onClose?.();
  };

  return (
    <Card className={cn("w-full h-full flex flex-col", className)}>
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">New Note</CardTitle>
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
                Title (Optional)
              </label>
              <Input
                placeholder="Note title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Thread Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Thread
              </label>
              <Select value={selectedThread} onValueChange={setSelectedThread}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a thread" />
                </SelectTrigger>
                <SelectContent>
                  {threads.map((thread) => (
                    <SelectItem key={thread.id} value={thread.id}>
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: `var(--color-${thread.color || 'blessed-blue'})` }}
                        />
                        <span>{thread.title}</span>
                        {thread.noteCount && (
                          <Badge variant="outline" className="text-xs">
                            {thread.noteCount}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                        {space.totalItemCount && (
                          <Badge variant="outline" className="text-xs">
                            {space.totalItemCount}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Content Textarea */}
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">
                Content
              </label>
              <Textarea
                placeholder="Write your note content here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-32 resize-none"
                required
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
                Make this note public
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!content.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Create Note
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
