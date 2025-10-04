import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { X, Edit, Trash2, Star, Pin, Hash, Folder } from 'lucide-react';
import { Note, Thread, Space } from '@harvous/types';
import { cn } from '../../lib/utils';

interface NoteDetailsPanelProps {
  note: Note;
  threads?: Thread[];
  spaces?: Space[];
  onClose?: () => void;
  onEdit?: (note: Note) => void;
  onDelete?: (note: Note) => void;
  className?: string;
}

export const NoteDetailsPanel: React.FC<NoteDetailsPanelProps> = ({
  note,
  threads = [],
  spaces = [],
  onClose,
  onEdit,
  onDelete,
  className
}) => {
  const [activeTab, setActiveTab] = useState('details');

  const handleEdit = () => {
    onEdit?.(note);
  };

  const handleDelete = () => {
    onDelete?.(note);
  };

  const getThreadById = (id: string) => threads.find(t => t.id === id);
  const getSpaceById = (id: string) => spaces.find(s => s.id === id);

  const currentThread = getThreadById(note.threadId);
  const currentSpace = note.spaceId ? getSpaceById(note.spaceId) : null;

  return (
    <Card className={cn("w-full h-full flex flex-col", className)}>
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Note Details</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="threads">Threads</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="flex-1 flex flex-col min-h-0">
            <div className="space-y-4 flex-1">
              {/* Note Info */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Title</label>
                  <p className="text-sm">{note.title || 'Untitled Note'}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Note ID</label>
                  <p className="text-sm font-mono">N{note.simpleNoteId?.toString().padStart(3, '0') || 'N/A'}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Created</label>
                  <p className="text-sm">{new Date(note.createdAt).toLocaleString()}</p>
                </div>
                
                {note.updatedAt && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Updated</label>
                    <p className="text-sm">{new Date(note.updatedAt).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                {note.isFeatured && (
                  <Badge variant="secondary" className="text-xs">
                    <Star className="w-3 h-3 mr-1" />
                    Featured
                  </Badge>
                )}
                {note.isPublic && (
                  <Badge variant="outline" className="text-xs">
                    Public
                  </Badge>
                )}
              </div>

              {/* Thread Info */}
              {currentThread && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Thread</label>
                  <div className="flex items-center space-x-2 mt-1">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: `var(--color-${currentThread.color || 'blessed-blue'})` }}
                    />
                    <span className="text-sm">{currentThread.title}</span>
                    {currentThread.isPinned && <Pin className="h-3 w-3 text-primary" />}
                  </div>
                </div>
              )}

              {/* Space Info */}
              {currentSpace && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Space</label>
                  <div className="flex items-center space-x-2 mt-1">
                    <Folder className="h-3 w-3" />
                    <span className="text-sm">{currentSpace.title}</span>
                  </div>
                </div>
              )}

              {/* Content Preview */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Content</label>
                <div className="mt-1 p-3 bg-muted rounded-md">
                  <p className="text-sm line-clamp-6">
                    {note.content.replace(/<[^>]*>/g, '')}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-4 border-t">
              <Button variant="outline" onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <Button onClick={handleEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="threads" className="flex-1 flex flex-col min-h-0">
            <div className="space-y-3 flex-1">
              <h4 className="text-sm font-medium">Related Threads</h4>
              {threads.length > 0 ? (
                <div className="space-y-2">
                  {threads.map((thread) => (
                    <div key={thread.id} className="flex items-center space-x-2 p-2 rounded-md bg-muted">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: `var(--color-${thread.color || 'blessed-blue'})` }}
                      />
                      <span className="text-sm">{thread.title}</span>
                      <Badge variant="outline" className="text-xs">
                        {thread.noteCount || 0}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No related threads</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
