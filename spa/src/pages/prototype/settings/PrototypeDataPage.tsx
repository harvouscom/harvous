import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiUrl } from '../../../lib/api';
import {
  fetchAndValidateUserExport,
  triggerAuthenticatedExportDownload,
  downloadUserBackupZip,
} from '@/utils/download-user-export';
import { refreshClientData } from '../../../lib/refresh-client-data';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from './SettingsShell';

type ExportFormat = 'markdown' | 'csv-threads';
type Busy =
  | null
  | 'export-md'
  | 'export-csv'
  | 'export-backup'
  | 'import'
  | 'import-preview'
  | 'clear'
  | 'delete';

interface ImportPreviewDoc {
  index: number;
  fileName: string;
  title: string;
  highlightCount: number;
  tagCount: number;
  sourceType: string;
  primaryCollection?: string | null;
  secondaryCollections?: string[];
}

function SettingsSectionLabel({ children }: { children: ReactNode }) {
  return <div className="pds-inspector-label proto-settings-section-label">{children}</div>;
}

function SettingsSectionHint({ children }: { children: ReactNode }) {
  return <p className="pds-caption proto-settings-section-hint">{children}</p>;
}

export default function PrototypeDataPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const importFormatRef = useRef<ExportFormat>('markdown');
  const pendingImportFilesRef = useRef<File[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewDoc[] | null>(null);
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set());
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  // Two-step inline confirmation for destructive actions (no dialog framework).
  const [confirming, setConfirming] = useState<null | 'clear' | 'delete'>(null);

  const resetStatus = () => {
    setMessage(null);
    setError(null);
  };

  const handleExport = async (format: ExportFormat) => {
    resetStatus();
    setBusy(format === 'markdown' ? 'export-md' : 'export-csv');
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    triggerAuthenticatedExportDownload(format, baseUrl);

    try {
      await fetchAndValidateUserExport(format, baseUrl);
      setMessage('Export downloaded.');
    } catch {
      setError("Couldn't export your data. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleBackupExport = async () => {
    resetStatus();
    setBusy('export-backup');
    try {
      const filename = await downloadUserBackupZip(import.meta.env.VITE_API_BASE_URL || '');
      setMessage(`Backup downloaded (${filename}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your backup. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handlePickImport = (format: ExportFormat) => {
    resetStatus();
    importFormatRef.current = format;
    fileInputRef.current?.click();
  };

  const handlePickFolderImport = () => {
    resetStatus();
    importFormatRef.current = 'markdown';
    folderInputRef.current?.click();
  };

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy('import-preview');
    resetStatus();
    setImportPreview(null);
    pendingImportFilesRef.current = Array.from(files);
    try {
      const form = new FormData();
      form.append('format', importFormatRef.current);
      Array.from(files).forEach((f) => form.append('files', f));
      const res = await fetch(apiUrl('/api/user/import/preview'), {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        documents?: ImportPreviewDoc[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error || `Preview failed (${res.status})`);
      const docs = data.documents ?? [];
      setImportPreview(docs);
      setImportSelected(new Set(docs.map((d) => d.index)));
      setImportWarnings(data.warnings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't preview import.");
      pendingImportFilesRef.current = [];
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    const files = pendingImportFilesRef.current;
    if (!files.length || !importPreview?.length || importSelected.size === 0) return;
    setBusy('import');
    resetStatus();
    try {
      const form = new FormData();
      form.append('format', importFormatRef.current);
      form.append('selectedIndices', JSON.stringify([...importSelected]));
      files.forEach((f) => form.append('files', f));
      const res = await fetch(apiUrl('/api/user/import'), {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        notesImported?: number;
        highlightsImported?: number;
        foldersCreated?: number;
        duplicatesSkipped?: number;
        scriptureProcessed?: number;
        autoTagsApplied?: number;
      };
      if (!res.ok || data.error) throw new Error(data.error || `Import failed (${res.status})`);
      const parts: string[] = [];
      if (data.notesImported != null) parts.push(`${data.notesImported} note${data.notesImported === 1 ? '' : 's'}`);
      if (data.highlightsImported != null && data.highlightsImported > 0) {
        parts.push(`${data.highlightsImported} highlight${data.highlightsImported === 1 ? '' : 's'}`);
      }
      if (data.foldersCreated != null && data.foldersCreated > 0) {
        parts.push(`${data.foldersCreated} folder${data.foldersCreated === 1 ? '' : 's'}`);
      }
      if (data.scriptureProcessed != null && data.scriptureProcessed > 0) {
        parts.push(`${data.scriptureProcessed} scripture ref${data.scriptureProcessed === 1 ? '' : 's'}`);
      }
      if (data.autoTagsApplied != null && data.autoTagsApplied > 0) {
        parts.push(`${data.autoTagsApplied} auto-tag${data.autoTagsApplied === 1 ? '' : 's'}`);
      }
      if (data.duplicatesSkipped != null && data.duplicatesSkipped > 0) {
        parts.push(`${data.duplicatesSkipped} duplicate${data.duplicatesSkipped === 1 ? '' : 's'} skipped`);
      }
      setMessage(parts.length > 0 ? `Import complete (${parts.join(', ')}).` : 'Import complete.');
      setImportPreview(null);
      pendingImportFilesRef.current = [];
      void refreshClientData(queryClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import that file.");
    } finally {
      setBusy(null);
    }
  };

  const cancelImportReview = () => {
    setImportPreview(null);
    setImportSelected(new Set());
    setImportWarnings([]);
    pendingImportFilesRef.current = [];
  };

  const handleClearData = async () => {
    setBusy('clear');
    resetStatus();
    try {
      await api.delete('/api/user/clear-data');
      setMessage('All notes, folders, and highlights were cleared.');
    } catch {
      setError("Couldn't clear your data. Please try again.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const handleDeleteAccount = async () => {
    setBusy('delete');
    resetStatus();
    try {
      await api.delete('/api/user/delete-account');
      navigate({ to: '/sign-in' });
    } catch {
      setError("Couldn't delete your account. Please try again.");
      setBusy(null);
      setConfirming(null);
    }
  };

  const importBusy = busy === 'import-preview' || busy === 'import';
  const reviewSummary = importPreview
    ? (() => {
        const totalHighlights = importPreview.reduce((s, d) => s + (d.highlightCount || 0), 0);
        const folders = new Set(importPreview.map((d) => d.primaryCollection || 'Unsorted'));
        return [
          `${importPreview.length} note${importPreview.length === 1 ? '' : 's'}`,
          totalHighlights > 0 ? `${totalHighlights} highlight${totalHighlights === 1 ? '' : 's'}` : null,
          `${folders.size} folder${folders.size === 1 ? '' : 's'}`,
        ]
          .filter(Boolean)
          .join(' · ');
      })()
    : '';
  const allImportSelected = Boolean(importPreview && importSelected.size === importPreview.length);

  return (
    <SettingsShell>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".md,.markdown,.csv,.txt,.docx,.html,.htm,.pdf,.enex,.zip"
        style={{ display: 'none' }}
        onChange={(e) => handleImportFiles(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error non-standard directory-selection attributes
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleImportFiles(e.target.files)}
      />

      <SettingsIntro>Export, import, or delete your data.</SettingsIntro>

      <SettingsSectionLabel>Export</SettingsSectionLabel>
      <SettingsSectionHint>Recommended for leaving Harvous or switching devices.</SettingsSectionHint>
      <SettingsGroup>
        <SettingsRow
          label="Full backup (.zip)"
          sublabel="Notes, folders, highlights, and connections — re-imports cleanly."
          trailing="none"
          onClick={handleBackupExport}
          value={busy === 'export-backup' ? '…' : undefined}
        />
        <SettingsRow
          label="Markdown (.md)"
          sublabel="One Markdown file of all notes with highlights. Good for reading or archives."
          trailing="none"
          onClick={() => handleExport('markdown')}
          value={busy === 'export-md' ? '…' : undefined}
        />
        <SettingsRow
          label="CSV spreadsheet"
          sublabel="Flat table of notes for Excel or Sheets. Not a full backup."
          trailing="none"
          onClick={() => handleExport('csv-threads')}
          value={busy === 'export-csv' ? '…' : undefined}
        />
      </SettingsGroup>

      <SettingsSectionLabel>Import</SettingsSectionLabel>
      <SettingsGroup>
        <SettingsRow
          label="Import files"
          sublabel="Markdown, text, Word, HTML, PDF, Evernote (.enex), or a Harvous backup zip."
          trailing="none"
          onClick={() => handlePickImport('markdown')}
          value={importBusy ? '…' : undefined}
        />
        <SettingsRow
          label="Import a folder"
          sublabel="Keeps structure — each subfolder becomes a folder in Harvous."
          trailing="none"
          onClick={handlePickFolderImport}
          value={importBusy ? '…' : undefined}
        />
        <SettingsRow
          label="Import CSV"
          sublabel="Spreadsheet of notes (folder, title, content, tags)."
          trailing="none"
          onClick={() => handlePickImport('csv-threads')}
          value={importBusy ? '…' : undefined}
        />
      </SettingsGroup>

      {importPreview && importPreview.length > 0 ? (
        <>
          <SettingsSectionLabel>Review import</SettingsSectionLabel>
          <div className="proto-settings-import-review">
            <div className="proto-settings-import-review__toolbar">
              <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>
                {reviewSummary}
              </span>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary proto-settings-import-review__select-all"
                onClick={() =>
                  setImportSelected(
                    allImportSelected ? new Set() : new Set(importPreview.map((d) => d.index)),
                  )
                }
              >
                {allImportSelected ? 'Select none' : 'Select all'}
              </button>
            </div>
            {importWarnings.length > 0 ? (
              <ul className="pds-caption proto-settings-import-review__warnings">
                {importWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            <div className="proto-settings-import-review__list">
              <SettingsGroup>
                {importPreview.map((doc) => {
                  const meta = [
                    `→ ${doc.primaryCollection || 'Unsorted'}`,
                    doc.highlightCount > 0
                      ? `${doc.highlightCount} highlight${doc.highlightCount === 1 ? '' : 's'}`
                      : null,
                    doc.tagCount > 0 ? `${doc.tagCount} tag${doc.tagCount === 1 ? '' : 's'}` : null,
                    doc.sourceType,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <label key={doc.index} className="proto-note-row proto-settings-import-review__row">
                      <input
                        type="checkbox"
                        checked={importSelected.has(doc.index)}
                        onChange={(e) => {
                          setImportSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(doc.index);
                            else next.delete(doc.index);
                            return next;
                          });
                        }}
                      />
                      <span className="proto-settings-list-row__main">
                        <span className="pds-list-title" style={{ display: 'block' }}>
                          {doc.title}
                        </span>
                        <span className="pds-list-preview" style={{ display: 'block', marginTop: 2 }}>
                          {meta}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </SettingsGroup>
            </div>
            <div className="proto-settings-import-review__actions">
              <button
                type="button"
                className="proto-settings-btn"
                disabled={busy === 'import' || importSelected.size === 0}
                onClick={handleConfirmImport}
              >
                {busy === 'import' ? 'Importing…' : `Import ${importSelected.size} selected`}
              </button>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary"
                disabled={busy === 'import'}
                onClick={cancelImportReview}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      ) : null}

      <SettingsSectionLabel>Danger zone</SettingsSectionLabel>
      <SettingsGroup>
        {confirming === 'clear' ? (
          <ConfirmRow
            prompt="Clear all notes, folders, and highlights? Your account stays."
            busy={busy === 'clear'}
            onConfirm={handleClearData}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <SettingsRow
            label="Clear all data"
            destructive
            trailing="none"
            onClick={() => {
              resetStatus();
              setConfirming('clear');
            }}
          />
        )}
        {confirming === 'delete' ? (
          <ConfirmRow
            prompt="Permanently delete your account and all data? This can't be undone."
            busy={busy === 'delete'}
            onConfirm={handleDeleteAccount}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <SettingsRow
            label="Delete account"
            destructive
            trailing="none"
            onClick={() => {
              resetStatus();
              setConfirming('delete');
            }}
          />
        )}
      </SettingsGroup>

      {message ? <p className="pds-caption proto-settings-status">{message}</p> : null}
      {error ? <p className="proto-settings-status proto-settings-status--error">{error}</p> : null}
    </SettingsShell>
  );
}

function ConfirmRow({
  prompt,
  busy,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="proto-settings-confirm-row">
      <span className="pds-caption" style={{ color: 'var(--pds-text-primary)' }}>
        {prompt}
      </span>
      <div className="proto-settings-confirm-row__actions">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="proto-settings-btn proto-settings-btn--destructive"
        >
          {busy ? 'Working…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="proto-settings-btn proto-settings-btn--secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
