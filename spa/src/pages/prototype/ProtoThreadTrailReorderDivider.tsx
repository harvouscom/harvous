/** Horizontal reorder divider between thread trail notes (study-dock divider pattern). */
export interface ProtoThreadTrailReorderDividerProps {
  insertBeforeIndex: number;
  dragNoteId: string;
  dragNoteTitle: string;
  /** Drop target only — no grab handle (e.g. top slot before the first note). */
  dropOnly?: boolean;
  isDragging?: boolean;
  onDragStart: (event: React.DragEvent<HTMLElement>, noteId: string) => void;
  onDragEnd: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>, insertBeforeIndex: number) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
}

export default function ProtoThreadTrailReorderDivider({
  insertBeforeIndex,
  dragNoteId,
  dragNoteTitle,
  dropOnly = false,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: ProtoThreadTrailReorderDividerProps) {
  return (
    <div
      className={`proto-thread-trail__reorder-divider${isDragging ? ' proto-thread-trail__reorder-divider--dragging' : ''}${dropOnly ? ' proto-thread-trail__reorder-divider--drop-only' : ''}`}
      role="presentation"
      onDragEnter={(e) => onDragOver(e, insertBeforeIndex)}
      onDragOver={(e) => onDragOver(e, insertBeforeIndex)}
      onDrop={onDrop}
    >
      {!dropOnly ? (
        <div
          className="proto-thread-trail__reorder-divider__handle"
          draggable
          role="button"
          tabIndex={0}
          aria-label={`Reorder ${dragNoteTitle}`}
          onMouseDown={(e) => e.stopPropagation()}
          onDragStart={(e) => onDragStart(e, dragNoteId)}
          onDragEnd={onDragEnd}
        />
      ) : null}
    </div>
  );
}
