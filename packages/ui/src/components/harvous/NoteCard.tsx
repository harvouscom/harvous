import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { MoreHorizontal, Edit, Trash2, Star } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Note } from '@harvous/types';
import { cn } from '../../lib/utils';

interface NoteCardProps {
  note: Note;
  onPress?: (note: Note) => void;
  onEdit?: (note: Note) => void;
  onDelete?: (note: Note) => void;
  onToggleFeatured?: (note: Note) => void;
  className?: string;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  onPress,
  onEdit,
  onDelete,
  onToggleFeatured,
  className
}) => {
  const handlePress = () => {
    onPress?.(note);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(note);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(note);
  };

  const handleToggleFeatured = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFeatured?.(note);
  };

  // Strip HTML from content for preview
  const previewContent = note.content.replace(/<[^>]*>/g, '').substring(0, 150);
  const hasMoreContent = note.content.length > 150;

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02]",
        note.isFeatured && "ring-2 ring-primary",
        className
      )}
      onClick={handlePress}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-mono">
                {note.simpleNoteId ? `N${note.simpleNoteId.toString().padStart(3, '0')}` : 'N'}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">
                {note.title || 'Untitled Note'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {new Date(note.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleToggleFeatured}>
                <Star className="mr-2 h-4 w-4" />
                {note.isFeatured ? 'Remove from Featured' : 'Add to Featured'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground">
          {previewContent}
          {hasMoreContent && '...'}
        </p>
        
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center space-x-2">
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
          <p className="text-xs text-muted-foreground">
            {note.content.length} chars
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
