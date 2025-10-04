import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { X, Clock, Hash } from 'lucide-react';
import { NavigationItem as NavigationItemType } from '@harvous/types';
import { cn } from '../../lib/utils';

interface NavigationItemProps {
  item: NavigationItemType;
  onPress?: (item: NavigationItemType) => void;
  onRemove?: (item: NavigationItemType) => void;
  className?: string;
}

export const NavigationItem: React.FC<NavigationItemProps> = ({
  item,
  onPress,
  onRemove,
  className
}) => {
  const handlePress = () => {
    onPress?.(item);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.(item);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'thread':
        return <Hash className="h-4 w-4" />;
      case 'space':
        return <Clock className="h-4 w-4" />;
      case 'note':
        return <Hash className="h-4 w-4" />;
      default:
        return <Hash className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'thread':
        return 'bg-blue-500';
      case 'space':
        return 'bg-green-500';
      case 'note':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] group",
        className
      )}
      onClick={handlePress}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-white text-sm",
              getTypeColor(item.type)
            )}>
              {getTypeIcon(item.type)}
            </div>
            <div>
              <h3 className="font-medium text-sm">{item.title}</h3>
              <p className="text-xs text-muted-foreground">
                {item.type} • {item.count} items
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs">
              {item.count}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleRemove}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
        
        <div className="mt-2 text-xs text-muted-foreground">
          Last accessed: {new Date(item.lastAccessed).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
};
