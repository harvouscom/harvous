import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { api } from '../../../lib/api';
import {
  fetchAndValidateUserExport,
  triggerAuthenticatedExportDownload,
  downloadUserBackupZip,
} from '@/utils/download-user-export';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import ProtoChipBar from '../components/ProtoChipBar';
import ImportWorkspace from '../import/ImportWorkspace';
import { SettingsGroup, SettingsRow, SettingsShell } from './SettingsShell';
import { setSettingsCloseBlocked } from './settings-close-guard';

type ExportFormat = 'markdown' | 'csv-threads';
type Busy = null | 'export-md' | 'export-csv' | 'export-backup' | 'clear' | 'delete';
type DataTab = 'import' | 'export' | 'danger';

const DATA_TABS = [
  { id: 'import' as const, label: 'Import' },
  { id: 'export' as const, label: 'Export' },
  { id: 'danger' as const, label: 'Danger zone' },
];


export default function PrototypeDataPage() {
  const navigate = useNavigate();
  // Import leads: it's the errand people arrive with, and export/danger are
  // things you go looking for deliberately.
  const [tab, setTab] = useState<DataTab>('import');
  const [busy, setBusy] = useState<Busy>(null);

  /**
   * A run in flight makes the modal un-dismissable. Closing it unmounts the engine
   * mid-upload, and the settings modal otherwise closes on a stray click outside or
   * an Escape — far too easy to do by accident during a several-minute import.
   */
  const setImportBusy = useCallback((importing: boolean) => {
    setSettingsCloseBlocked(importing);
  }, []);
  useEffect(() => () => setSettingsCloseBlocked(false), []);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    // Import needs the room; export and danger are row lists that don't mind it.
    <SettingsShell wide={tab === 'import'}>
      <ProtoChipBar
        ariaLabel="My Data sections"
        options={DATA_TABS}
        selectedId={tab}
        onSelect={(next) => {
          setConfirming(null);
          resetStatus();
          setTab(next);
        }}
      />
      {tab === 'import' ? (
        <ImportWorkspace
          onBusyChange={setImportBusy}
          onExit={() => navigate({ to: prototypeHomeRouteTo() })}
        />
      ) : null}

      {tab === 'export' ? (
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
      ) : null}

      {tab === 'danger' ? (
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
      ) : null}

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
