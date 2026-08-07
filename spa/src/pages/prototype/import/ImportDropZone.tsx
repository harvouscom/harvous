/**
 * The drop target. Two sizes: the full-bleed panel that owns an empty surface, and
 * a compact strip once rows exist. Hover is signalled by rings that scale outward
 * and fade — a dashed border says "form field", a pulse says "let go".
 */
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import ImportSourceFan from './ImportSourceFan';
import { IMPORT_ACCEPT_ATTRIBUTE } from './import-file-sources';

export interface ImportDropZoneProps {
  variant: 'full' | 'compact';
  onFiles: (files: FileList | null) => void;
  onDataTransfer: (dataTransfer: DataTransfer) => void;
  /** Pins the drag-over state so the design gallery can show it without a real drag. */
  previewActive?: boolean;
  children?: ReactNode;
}

const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes('Files');

export default function ImportDropZone({
  variant,
  onFiles,
  onDataTransfer,
  previewActive = false,
  children,
}: ImportDropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [hovering, setHovering] = useState(false);
  const dragOver = hovering || previewActive;
  const setDragOver = setHovering;
  /** Nested dragenter/dragleave fire constantly; count them instead of toggling. */
  const dragDepth = useRef(0);

  return (
    <div
      className={`proto-import-drop proto-import-drop--${variant}${
        dragOver ? ' proto-import-drop--active' : ''
      }`}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        onDataTransfer(e.dataTransfer);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={IMPORT_ACCEPT_ATTRIBUTE}
        style={{ display: 'none' }}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error non-standard directory-selection attributes
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {variant === 'full' ? (
        <div className="proto-import-drop__stage">
          <ImportSourceFan />
          <h2 className="proto-import-drop__title">
            {dragOver ? 'Release to import' : 'Start with what you have'}
          </h2>
          {/* Two lines at this measure. The fan above already names the formats, so
              the copy spends its words on what happens to them instead. */}
          <p className="proto-import-drop__hint">
            Drop in a file or a whole folder. Your folders come across as they are, and scripture
            references link themselves.
          </p>
          <div className="proto-import-drop__actions">
            <button
              type="button"
              className="proto-settings-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose files
            </button>
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              onClick={() => folderInputRef.current?.click()}
            >
              Choose a folder
            </button>
          </div>
        </div>
      ) : (
        <div className="proto-import-drop__strip">
          <span className="proto-import-drop__strip-label">
            {dragOver ? 'Release to add these too' : 'Drop more files here'}
          </span>
          <div className="proto-import-drop__strip-actions">
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Add files
            </button>
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              onClick={() => folderInputRef.current?.click()}
            >
              Add folder
            </button>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
