import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { MoreHorizontal, Edit, Trash2, Settings, Folder } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Space } from '@harvous/types';
import { cn } from '../../lib/utils';

interface SpaceCardProps {
  space: Space;
  onPress?: (space: Space) => void;
  onEdit?: (space: Space) => void;
  onDelete?: (space: Space) => void;
  onSettings?: (space: Space) => void;
  className?: string;
}

export const SpaceCard: React.FC<SpaceCardProps> = ({
  space,
  onPress,
  onEdit,
  onDelete,
  onSettings,
  className
}) => {
  const handlePress = () => {
    onPress?.(space);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(space);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(space);
  };

  const handleSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSettings?.(space);
  };

  // Get color classes based on space color
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
        space.isActive && "ring-2 ring-primary",
        className
      )}
      onClick={handlePress}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div 
              className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center text-white text-lg font-bold",
                getColorClasses(space.color)
              )}
            >
              <Folder className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl">
                {space.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {space.description || 'No description'}
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
              <DropdownMenuItem onClick={handleSettings}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
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
              {space.totalItemCount || 0} items
            </Badge>
            {space.isPublic && (
              <Badge variant="secondary" className="text-xs">
                Public
              </Badge>
            )}
            {space.isActive && (
              <Badge variant="default" className="text-xs">
                Active
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Created {new Date(space.createdAt).toLocaleDateString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
