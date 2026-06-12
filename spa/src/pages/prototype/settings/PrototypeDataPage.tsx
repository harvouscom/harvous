import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiUrl } from '../../../lib/api';
import {
  fetchAndValidateUserExport,
  triggerAuthenticatedExportDownload,
  downloadUserBackupZip,
} from '@/utils/download-user-export';
import { refreshClientData } from '../../../lib/refresh-client-data';
import { clearStuckSyncQueue } from '@/utils/sync-manager';
import { getPersistedUserId } from '@/utils/user-id';
import { SettingsShell, SettingsGroup, SettingsRow } from './SettingsShell';

type ExportFormat = 'markdown' | 'csv-threads';
type Busy =
  | null
  | 'export-md'
  | 'export-csv'
  | 'export-backup'
  | 'import'
  | 'import-preview'
  | 'clear'
  | 'clear-sync'
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
  const [confirming, setConfirming] = useState<null | 'clear' | 'delete' | 'clear-sync'>(null);

  const resetStatus = () => { setMessage(null); setError(null); };

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
    } catch {
      setError("Couldn't create your backup. Please try again.");
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

  const handleClearStuckSyncQueue = async () => {
    setBusy('clear-sync');
    resetStatus();
    const userId = getPersistedUserId();
    if (!userId) {
      setError("Couldn't clear the save queue. Please sign in again.");
      setBusy(null);
      setConfirming(null);
      return;
    }
    try {
      const removed = await clearStuckSyncQueue(userId, { entireQueue: true });
      setMessage(
        removed > 0
          ? `Cleared ${removed} stuck save${removed === 1 ? '' : 's'} from this device.`
          : 'Nothing was waiting to save on this device.',
      );
    } catch {
      setError("Couldn't clear the save queue. Please try again.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
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

  return (
    <SettingsShell title="My Data">
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

      <p className="pds-subheadline" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 16px', padding: '0 12px' }}>
        Export your study, bring notes in from a file, or remove your data.
      </p>

      <div className="pds-inspector-label" style={{ padding: '0 12px 6px', textTransform: 'uppercase', color: 'var(--pds-text-tertiary)' }}>
        Export
      </div>
      <SettingsGroup>
        <SettingsRow label="Full backup (.zip)" trailing="none" onClick={handleBackupExport} value={busy === 'export-backup' ? '…' : undefined} />
        <SettingsRow label="Export as Markdown" trailing="none" onClick={() => handleExport('markdown')} value={busy === 'export-md' ? '…' : undefined} />
        <SettingsRow label="Export as CSV" trailing="none" onClick={() => handleExport('csv-threads')} value={busy === 'export-csv' ? '…' : undefined} />
      </SettingsGroup>
      <p className="pds-caption" style={{ color: 'var(--pds-text-tertiary)', padding: '6px 12px 0', margin: 0 }}>
        Full backup keeps everything — notes, folders, highlights, annotations, and connections — and re-imports cleanly.
        Markdown is per-note with highlights; CSV is a flat spreadsheet summary.
      </p>

      <div className="pds-inspector-label" style={{ padding: '16px 12px 6px', textTransform: 'uppercase', color: 'var(--pds-text-tertiary)' }}>
        Import
      </div>
      <SettingsGroup>
        <SettingsRow label="Import files (Markdown, Word, HTML, PDF, .zip)" trailing="none" onClick={() => handlePickImport('markdown')} value={busy === 'import-preview' || busy === 'import' ? '…' : undefined} />
        <SettingsRow label="Import a folder" trailing="none" onClick={handlePickFolderImport} />
        <SettingsRow label="Import CSV file" trailing="none" onClick={() => handlePickImport('csv-threads')} />
      </SettingsGroup>
      <p className="pds-caption" style={{ color: 'var(--pds-text-tertiary)', padding: '6px 12px 0', margin: 0 }}>
        Importing a folder keeps your structure: each subfolder becomes a folder in Harvous.
      </p>

      {importPreview && importPreview.length > 0 ? (
        <div style={{ marginTop: 16, padding: '0 12px' }}>
          <p className="pds-subheadline" style={{ margin: '0 0 4px' }}>Review import</p>
          {(() => {
            const totalHighlights = importPreview.reduce((s, d) => s + (d.highlightCount || 0), 0);
            const folders = new Set(importPreview.map((d) => d.primaryCollection || 'Unsorted'));
            const summary = [
              `${importPreview.length} note${importPreview.length === 1 ? '' : 's'}`,
              totalHighlights > 0 ? `${totalHighlights} highlight${totalHighlights === 1 ? '' : 's'}` : null,
              `${folders.size} folder${folders.size === 1 ? '' : 's'}`,
            ].filter(Boolean).join(' · ');
            const allSelected = importSelected.size === importPreview.length;
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 8px' }}>
                <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>{summary}</span>
                <button
                  type="button"
                  className="proto-settings-btn proto-settings-btn--secondary"
                  style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                  onClick={() =>
                    setImportSelected(allSelected ? new Set() : new Set(importPreview.map((d) => d.index)))
                  }
                >
                  {allSelected ? 'Select none' : 'Select all'}
                </button>
              </div>
            );
          })()}
          {importWarnings.length > 0 ? (
            <ul className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 8px', paddingLeft: 18 }}>
              {importWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {importPreview.map((doc) => {
              const meta = [
                `→ ${doc.primaryCollection || 'Unsorted'}`,
                doc.highlightCount > 0 ? `${doc.highlightCount} highlight${doc.highlightCount === 1 ? '' : 's'}` : null,
                doc.tagCount > 0 ? `${doc.tagCount} tag${doc.tagCount === 1 ? '' : 's'}` : null,
                doc.sourceType,
              ].filter(Boolean).join(' · ');
              return (
                <label key={doc.index} className="proto-note-row" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
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
                  <span>
                    <span className="pds-list-title" style={{ display: 'block' }}>{doc.title}</span>
                    <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>{meta}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="proto-settings-btn" disabled={busy === 'import' || importSelected.size === 0} onClick={handleConfirmImport}>
              {busy === 'import' ? 'Importing…' : `Import ${importSelected.size} selected`}
            </button>
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary" disabled={busy === 'import'} onClick={cancelImportReview}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="pds-inspector-label" style={{ padding: '16px 12px 6px', textTransform: 'uppercase', color: 'var(--pds-text-tertiary)' }}>
        Troubleshooting
      </div>
      <SettingsGroup>
        {confirming === 'clear-sync' ? (
          <ConfirmRow
            prompt="Clear the local save queue on this device? Your notes on the server are not deleted."
            busy={busy === 'clear-sync'}
            onConfirm={handleClearStuckSyncQueue}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <SettingsRow
            label="Clear stuck save queue"
            trailing="none"
            onClick={() => {
              resetStatus();
              setConfirming('clear-sync');
            }}
          />
        )}
      </SettingsGroup>
      <p className="pds-caption" style={{ color: 'var(--pds-text-tertiary)', padding: '6px 12px 0', margin: 0 }}>
        Use if saves seem stuck or you see a save warning. This only clears unsent changes waiting on this device.
      </p>

      <div className="pds-inspector-label" style={{ padding: '16px 12px 6px', textTransform: 'uppercase', color: 'var(--pds-text-tertiary)' }}>
        Danger zone
      </div>
      <SettingsGroup>
        {confirming === 'clear' ? (
          <ConfirmRow
            prompt="Clear all notes, folders, and highlights? Your account stays."
            busy={busy === 'clear'}
            onConfirm={handleClearData}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <SettingsRow label="Clear all data" destructive trailing="none" onClick={() => { resetStatus(); setConfirming('clear'); }} />
        )}
        {confirming === 'delete' ? (
          <ConfirmRow
            prompt="Permanently delete your account and all data? This can't be undone."
            busy={busy === 'delete'}
            onConfirm={handleDeleteAccount}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <SettingsRow label="Delete account" destructive trailing="none" onClick={() => { resetStatus(); setConfirming('delete'); }} />
        )}
      </SettingsGroup>

      {message ? <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', padding: '0 12px' }}>{message}</p> : null}
      {error ? <p style={{ color: 'var(--pds-destructive)', fontSize: '0.8125rem', padding: '0 12px' }}>{error}</p> : null}
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
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="pds-caption" style={{ color: 'var(--pds-text-primary)' }}>{prompt}</span>
      <div style={{ display: 'flex', gap: 8 }}>
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
