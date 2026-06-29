import React, { useState } from 'react';
import AdminDiagnosticsPanel from '@/components/react/AdminDiagnosticsPanel';
import {
  useAggregateAnalytics,
  useCleanupDuplicateNoteThreads,
  useCleanupDuplicateScriptureRefs,
  useBackfillAutoTags,
  useCheckLinkIntegrity,
  useRegenerateNoteTags,
} from '@/hooks/queries/useAdminMaintenance';
import '@/styles/admin-usage.css';
import '@/styles/admin-maintenance.css';

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function JobResult({ error, data }: { error: Error | null; data: unknown }) {
  if (error) {
    return <pre className="admin-maintenance__result admin-maintenance__result--error">{error.message}</pre>;
  }
  if (!data) return null;
  return <pre className="admin-maintenance__result">{formatResult(data)}</pre>;
}

function MaintenanceJobCard({
  title,
  description,
  children,
  previewPending,
  runPending,
  onPreview,
  onRun,
  showPreview = true,
  previewResult,
  runResult,
  previewError,
  runError,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
  previewPending?: boolean;
  runPending?: boolean;
  onPreview?: () => void;
  onRun?: () => void;
  showPreview?: boolean;
  previewResult?: unknown;
  runResult?: unknown;
  previewError?: Error | null;
  runError?: Error | null;
}) {
  return (
    <section className="admin-maintenance__job">
      <h2 className="admin-maintenance__job-title">{title}</h2>
      <p className="admin-maintenance__job-desc">{description}</p>
      {children}
      <div className="admin-maintenance__job-actions">
        {showPreview && onPreview ? (
          <button type="button" className="admin-action-btn" onClick={onPreview} disabled={previewPending}>
            {previewPending ? 'Previewing…' : 'Preview'}
          </button>
        ) : null}
        {onRun ? (
          <button
            type="button"
            className="admin-action-btn admin-action-btn--emphasis"
            onClick={onRun}
            disabled={runPending}
          >
            {runPending ? 'Running…' : 'Run'}
          </button>
        ) : null}
      </div>
      {previewResult !== undefined || previewError ? (
        <JobResult error={previewError ?? null} data={previewResult} />
      ) : null}
      {runResult !== undefined || runError ? <JobResult error={runError ?? null} data={runResult} /> : null}
    </section>
  );
}

export default function AdminMaintenancePanel() {
  const aggregate = useAggregateAnalytics();
  const cleanupNoteThreads = useCleanupDuplicateNoteThreads();
  const cleanupScriptureRefs = useCleanupDuplicateScriptureRefs();
  const backfillTags = useBackfillAutoTags();
  const linkIntegrity = useCheckLinkIntegrity();
  const regenerateTags = useRegenerateNoteTags();

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [noteId, setNoteId] = useState('');

  return (
    <div className="admin-usage__board">
      <AdminDiagnosticsPanel />

      <p className="admin-maintenance__intro">
        Platform maintenance jobs for Harvous admins. Use Preview first when available. Link integrity repairs
        content owned by your admin account (the Harvous system user).
      </p>

      <div className="admin-maintenance__jobs">
        <MaintenanceJobCard
          title="Monthly analytics"
          description="Runs automatically on the 1st of each month (UTC) for the prior month. Use here to backfill older months or regenerate a snapshot."
          showPreview={false}
          runPending={aggregate.isPending}
          onRun={() => aggregate.mutate({ month })}
          runResult={aggregate.data}
          runError={aggregate.error}
        >
          <div className="admin-maintenance__month-row">
            <input
              type="month"
              className="admin-maintenance__input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <button
              type="button"
              className="admin-action-btn"
              onClick={() => aggregate.mutate({ previous: true })}
              disabled={aggregate.isPending}
            >
              Previous month
            </button>
          </div>
        </MaintenanceJobCard>

        <MaintenanceJobCard
          title="Duplicate note-thread links"
          description="Remove duplicate NoteThreads junction rows platform-wide, keeping the oldest entry per pair."
          previewPending={cleanupNoteThreads.isPending && cleanupNoteThreads.variables === true}
          runPending={cleanupNoteThreads.isPending && cleanupNoteThreads.variables === false}
          onPreview={() => cleanupNoteThreads.mutate(true)}
          onRun={() => cleanupNoteThreads.mutate(false)}
          previewResult={cleanupNoteThreads.variables === true ? cleanupNoteThreads.data : undefined}
          previewError={cleanupNoteThreads.variables === true ? cleanupNoteThreads.error : null}
          runResult={cleanupNoteThreads.variables === false ? cleanupNoteThreads.data : undefined}
          runError={cleanupNoteThreads.variables === false ? cleanupNoteThreads.error : null}
        />

        <MaintenanceJobCard
          title="Duplicate scripture references"
          description="Remove duplicate NoteScriptureReferences rows platform-wide, keeping the oldest entry per pair."
          previewPending={cleanupScriptureRefs.isPending && cleanupScriptureRefs.variables === true}
          runPending={cleanupScriptureRefs.isPending && cleanupScriptureRefs.variables === false}
          onPreview={() => cleanupScriptureRefs.mutate(true)}
          onRun={() => cleanupScriptureRefs.mutate(false)}
          previewResult={cleanupScriptureRefs.variables === true ? cleanupScriptureRefs.data : undefined}
          previewError={cleanupScriptureRefs.variables === true ? cleanupScriptureRefs.error : null}
          runResult={cleanupScriptureRefs.variables === false ? cleanupScriptureRefs.data : undefined}
          runError={cleanupScriptureRefs.variables === false ? cleanupScriptureRefs.error : null}
        />

        <MaintenanceJobCard
          title="Auto-tag backfill"
          description="Re-run keyword auto-tags on Harvous system notes that have no tags yet."
          previewPending={backfillTags.isPending && backfillTags.variables?.dryRun === true}
          runPending={backfillTags.isPending && backfillTags.variables?.dryRun === false}
          onPreview={() => backfillTags.mutate({ dryRun: true, onlyWithoutTags: true })}
          onRun={() => backfillTags.mutate({ dryRun: false, onlyWithoutTags: true })}
          previewResult={backfillTags.variables?.dryRun === true ? backfillTags.data : undefined}
          previewError={backfillTags.variables?.dryRun === true ? backfillTags.error : null}
          runResult={backfillTags.variables?.dryRun === false ? backfillTags.data : undefined}
          runError={backfillTags.variables?.dryRun === false ? backfillTags.error : null}
        />

        <MaintenanceJobCard
          title="Link integrity (curated content)"
          description="Repair missing note-thread junctions and orphan scripture links for Harvous-owned notes."
          previewPending={linkIntegrity.isPending && linkIntegrity.variables === true}
          runPending={linkIntegrity.isPending && linkIntegrity.variables === false}
          onPreview={() => linkIntegrity.mutate(true)}
          onRun={() => linkIntegrity.mutate(false)}
          previewResult={linkIntegrity.variables === true ? linkIntegrity.data : undefined}
          previewError={linkIntegrity.variables === true ? linkIntegrity.error : null}
          runResult={linkIntegrity.variables === false ? linkIntegrity.data : undefined}
          runError={linkIntegrity.variables === false ? linkIntegrity.error : null}
        />

        <section className="admin-maintenance__job">
          <h2 className="admin-maintenance__job-title">Regenerate note tags</h2>
          <p className="admin-maintenance__job-desc">
            Re-apply keyword auto-tags for one Harvous-owned note by ID.
          </p>
          <form
            className="admin-maintenance__inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!noteId.trim()) return;
              regenerateTags.mutate(noteId.trim());
            }}
          >
            <input
              className="admin-maintenance__input"
              placeholder="note_…"
              value={noteId}
              onChange={(e) => setNoteId(e.target.value)}
            />
            <button type="submit" className="admin-action-btn admin-action-btn--emphasis" disabled={regenerateTags.isPending}>
              {regenerateTags.isPending ? 'Running…' : 'Run'}
            </button>
          </form>
          <JobResult error={regenerateTags.error} data={regenerateTags.data} />
        </section>
      </div>
    </div>
  );
}
