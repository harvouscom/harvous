import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { MoreHorizontal, Edit, Trash2, Pin, PinOff } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Thread } from '@harvous/types';
import { cn } from '../../lib/utils';

interface ThreadCardProps {
  thread: Thread;
  onPress?: (thread: Thread) => void;
  onEdit?: (thread: Thread) => void;
  onDelete?: (thread: Thread) => void;
  onTogglePin?: (thread: Thread) => void;
  className?: string;
}

export const ThreadCard: React.FC<ThreadCardProps> = ({
  thread,
  onPress,
  onEdit,
  onDelete,
  onTogglePin,
  className
}) => {
  const handlePress = () => {
    onPress?.(thread);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(thread);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(thread);
  };

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin?.(thread);
  };

  // Get color classes based on thread color
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
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02]",
        thread.isPinned && "ring-2 ring-primary",
        className
      )}
      onClick={handlePress}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div 
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium",
                getColorClasses(thread.color)
              )}
            >
              {thread.title.charAt(0).toUpperCase()}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {thread.title}
                {thread.isPinned && <Pin className="h-4 w-4 text-primary" />}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {thread.subtitle || `${thread.noteCount || 0} notes`}
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
              <DropdownMenuItem onClick={handleTogglePin}>
                {thread.isPinned ? (
                  <>
                    <PinOff className="mr-2 h-4 w-4" />
                    Unpin
                  </>
                ) : (
                  <>
                    <Pin className="mr-2 h-4 w-4" />
                    Pin
                  </>
                )}
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
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs">
              {thread.noteCount || 0} notes
            </Badge>
            {thread.isPublic && (
              <Badge variant="secondary" className="text-xs">
                Public
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Updated {new Date(thread.updatedAt || thread.createdAt).toLocaleDateString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
