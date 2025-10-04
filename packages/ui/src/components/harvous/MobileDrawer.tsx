import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { NewNotePanel } from './NewNotePanel';
import { NewThreadPanel } from './NewThreadPanel';
import { NoteDetailsPanel } from './NoteDetailsPanel';
import { Note, Thread, Space } from '@harvous/types';
import { cn } from '../../lib/utils';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  drawerType: 'note' | 'thread' | 'noteDetails' | 'none';
  currentThread?: Thread;
  currentSpace?: Space;
  currentNote?: Note;
  threads?: Thread[];
  spaces?: Space[];
  className?: string;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  drawerType,
  currentThread,
  currentSpace,
  currentNote,
  threads = [],
  spaces = [],
  className
}) => {
  const renderContent = () => {
    switch (drawerType) {
      case 'note':
        return (
          <NewNotePanel
            onClose={onClose}
            currentThread={currentThread}
            currentSpace={currentSpace}
            threads={threads}
            spaces={spaces}
          />
        );
      case 'thread':
        return (
          <NewThreadPanel
            onClose={onClose}
            currentSpace={currentSpace}
            spaces={spaces}
          />
        );
      case 'noteDetails':
        return currentNote ? (
          <NoteDetailsPanel
            note={currentNote}
            threads={threads}
            spaces={spaces}
            onClose={onClose}
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className={cn("h-[80vh] rounded-t-lg", className)}>
        <SheetHeader>
          <SheetTitle>
            {drawerType === 'note' && 'New Note'}
            {drawerType === 'thread' && 'New Thread'}
            {drawerType === 'noteDetails' && 'Note Details'}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </SheetContent>
    </Sheet>
  );
};
