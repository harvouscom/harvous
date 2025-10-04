import React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { MoreHorizontal, Plus, Hash, Folder, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MoreMenuProps {
  onNewNote?: () => void;
  onNewThread?: () => void;
  onNewSpace?: () => void;
  onSettings?: () => void;
  className?: string;
}

export const MoreMenu: React.FC<MoreMenuProps> = ({
  onNewNote,
  onNewThread,
  onNewSpace,
  onSettings,
  className
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("h-10 w-10", className)}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onNewNote}>
          <Plus className="mr-2 h-4 w-4" />
          New Note
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNewThread}>
          <Hash className="mr-2 h-4 w-4" />
          New Thread
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNewSpace}>
          <Folder className="mr-2 h-4 w-4" />
          New Space
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSettings}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
