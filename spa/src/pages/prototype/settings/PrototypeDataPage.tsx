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
import { clearAllRecentSearches } from '@/utils/recent-search-storage';
import { clearAllRecentOpens } from '../library-panel/proto-recent-opens';
import { clearServerSearchHistory } from '../proto-search-events';

type ExportFormat = 'markdown' | 'csv-threads';
type Busy = null | 'export-md' | 'export-csv' | 'export-backup' | 'clear' | 'delete';
/**
 * Only the two that are peers. Import and export are the same errand in opposite
 * directions, so toggling between them makes sense; clearing your library or
 * deleting your account is a different kind of act, and a tab would present it as
 * an equal third option. It sits below instead, quiet and out of the way.
 */
type DataTab = 'import' | 'export';

const DATA_TABS = [
  { id: 'import' as const, label: 'Import' },
  { id: 'export' as const, label: 'Export' },
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
  const [importBusy, setImportBusyState] = useState(false);
  const setImportBusy = useCallback((importing: boolean) => {
    setImportBusyState(importing);
    setSettingsCloseBlocked(importing);
  }, []);
  useEffect(() => () => setSettingsCloseBlocked(false), []);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Two-step inline confirmation for destructive actions (no dialog framework).
  const [confirming, setConfirming] = useState<null | 'clear' | 'delete' | 'search-history'>(null);

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

  const handleClearSearchHistory = () => {
    clearAllRecentSearches();
    clearAllRecentOpens();
    /* The account-side half. Clearing only the device would leave the history that actually
       feeds suggestions untouched, which is not what the label promises. Not awaited: the
       list the reader can see is the local one, and a failed request should not leave the
       confirm sitting open over a job that visibly already happened. */
    void clearServerSearchHistory();
    setConfirming(null);
    setMessage('Search history cleared.');
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
        ariaLabel="My Notes sections"
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

      {/* Always present, never a tab — and hidden mid-import, because offering to
          clear the library while notes are being written into it is a trap. */}
      {!importBusy ? (
      <section className="proto-settings-danger">
        <h2 className="pds-inspector-label proto-settings-danger__label">Danger zone</h2>

        {/* Two quiet text buttons rather than two full-height rows in a card. These
            aren't things to browse — they're things you'd only click on purpose, so
            they take the least room that still leaves them reachable. The confirm
            replaces them in place, which is also what keeps the prompt attached to
            the button that raised it. */}
        {confirming ? (
          <ConfirmRow
            prompt={
              confirming === 'search-history'
                ? 'Forget your recent searches and what you last opened? Your notes stay.'
                : confirming === 'clear'
                  ? 'Clear all notes, folders, and highlights? Your account stays.'
                  : "Permanently delete your account and all data? This can't be undone."
            }
            /* Never busy for the history clear: the local wipe is synchronous and the account
               half is fire-and-forget, so there is nothing to wait on. */
            busy={confirming !== 'search-history' && busy === confirming}
            onConfirm={
              confirming === 'search-history'
                ? handleClearSearchHistory
                : confirming === 'clear'
                  ? handleClearData
                  : handleDeleteAccount
            }
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <div className="proto-settings-danger__actions">
            {/* First in the row because the row reads least to most severe, and this one is
                the only member you might reasonably use twice. It sits here rather than in a
                card of its own: a full row with a sublabel gave a housekeeping control more
                furniture than the two controls that can end your account. */}
            <button
              type="button"
              className="proto-settings-danger__btn"
              onClick={() => {
                resetStatus();
                setConfirming('search-history');
              }}
            >
              Clear search history
            </button>
            <button
              type="button"
              className="proto-settings-danger__btn"
              onClick={() => {
                resetStatus();
                setConfirming('clear');
              }}
            >
              Clear all data
            </button>
            <button
              type="button"
              className="proto-settings-danger__btn"
              onClick={() => {
                resetStatus();
                setConfirming('delete');
              }}
            >
              Delete account
            </button>
          </div>
        )}
      </section>
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
