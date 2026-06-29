import React, { useState } from 'react';
import {
  useAdminDiagnosticIssueEvents,
  useAdminDiagnosticIssues,
  useUpdateDiagnosticTriage,
  type DiagnosticIssueSummary,
} from '@/hooks/queries/useAdminDiagnostics';
import type { DiagnosticTriageStatus } from '@/utils/diagnostic-sources';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';

function formatWhen(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(status: DiagnosticTriageStatus): string {
  if (status === 'resolved') return 'Resolved';
  if (status === 'ignored') return 'Ignored';
  return 'Open';
}

function IssueRow({ issue }: { issue: DiagnosticIssueSummary }) {
  const [expanded, setExpanded] = useState(false);
  const events = useAdminDiagnosticIssueEvents(expanded ? issue.issueSignature : null);
  const triage = useUpdateDiagnosticTriage();

  const setStatus = (status: DiagnosticTriageStatus) => {
    triage.mutate({ signature: issue.issueSignature, status });
  };

  return (
    <article className="admin-diagnostics__issue">
      <div
        className="admin-diagnostics__issue-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        aria-expanded={expanded}
      >
        <span className={`admin-diagnostics__status admin-diagnostics__status--${issue.status}`}>
          {statusLabel(issue.status)}
        </span>
        <span className="admin-diagnostics__issue-message">{issue.message}</span>
        <span className="admin-diagnostics__issue-meta">
          {issue.count}× · {formatWhen(issue.lastSeen)}
        </span>
      </div>

      {expanded ? (
        <div className="admin-diagnostics__issue-body">
          <p className="admin-diagnostics__issue-detail">
            Signature: <code>{issue.issueSignature}</code>
          </p>
          {issue.topRoute ? (
            <p className="admin-diagnostics__issue-detail">Top route: {issue.topRoute}</p>
          ) : null}
          <p className="admin-diagnostics__issue-detail">Sources: {issue.sources.join(', ') || '—'}</p>

          <div className="admin-diagnostics__issue-actions">
            <button type="button" className="admin-action-btn" onClick={() => setStatus('open')} disabled={triage.isPending}>
              Reopen
            </button>
            <button
              type="button"
              className="admin-action-btn admin-action-btn--emphasis"
              onClick={() => setStatus('resolved')}
              disabled={triage.isPending}
            >
              Resolve
            </button>
            <button type="button" className="admin-action-btn" onClick={() => setStatus('ignored')} disabled={triage.isPending}>
              Ignore
            </button>
          </div>

          {events.isLoading ? (
            <ProtoStatusChip visible variant="syncing" label="Loading samples…" />
          ) : null}
          {events.data?.events.map((ev) => (
            <div key={ev.id} className="admin-diagnostics__sample">
              <div className="admin-diagnostics__sample-head">
                <span>{ev.source}</span>
                <span>{formatWhen(ev.createdAt)}</span>
              </div>
              {ev.route ? <div className="admin-diagnostics__sample-route">{ev.route}</div> : null}
              {ev.manualNote ? <div className="admin-diagnostics__sample-note">{ev.manualNote}</div> : null}
              {ev.stack ? <pre className="admin-diagnostics__sample-stack">{ev.stack.slice(0, 600)}</pre> : null}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function AdminDiagnosticsPanel() {
  const [days, setDays] = useState(7);
  const issues = useAdminDiagnosticIssues(days);
  const showLoadingChip = issues.isLoading || issues.isFetching;

  const sectionHeader = (
    <>
      <h2 className="admin-maintenance__job-title">Issue signals</h2>
      <p className="admin-maintenance__job-desc">
        Anonymous client errors and manual reports. No user IDs are stored — only scrubbed messages, routes, and
        stack snippets.
      </p>
    </>
  );

  if (showLoadingChip && !issues.data) {
    return (
      <section className="admin-diagnostics" id="maintenance-diagnostics">
        {sectionHeader}
        <ProtoStatusChip visible variant="syncing" label="Loading…" />
      </section>
    );
  }

  if (issues.isError && !issues.data) {
    return (
      <section className="admin-diagnostics" id="maintenance-diagnostics">
        {sectionHeader}
        <p className="admin-diagnostics__error">
          {issues.error instanceof Error ? issues.error.message : 'Could not load diagnostic issues. Try again.'}
        </p>
      </section>
    );
  }

  const data = issues.data;
  const list = data?.issues ?? [];

  return (
    <section className="admin-diagnostics" id="maintenance-diagnostics">
      {sectionHeader}
      <ProtoStatusChip visible={showLoadingChip} variant="syncing" label="Loading…" />

      <div className="admin-diagnostics__hero">
        <div className="admin-diagnostics__hero-stat">
          <div className="admin-diagnostics__hero-value">{data?.openCount ?? 0}</div>
          <div className="admin-diagnostics__hero-label">Open issues</div>
        </div>
        <div className="admin-diagnostics__hero-stat">
          <div className="admin-diagnostics__hero-value">{data?.eventsLast24h ?? 0}</div>
          <div className="admin-diagnostics__hero-label">Events (24h)</div>
        </div>
      </div>

      <div className="admin-diagnostics__filters">
        <button
          type="button"
          className={`admin-action-btn${days === 7 ? ' admin-action-btn--emphasis' : ''}`}
          onClick={() => setDays(7)}
        >
          7 days
        </button>
        <button
          type="button"
          className={`admin-action-btn${days === 30 ? ' admin-action-btn--emphasis' : ''}`}
          onClick={() => setDays(30)}
        >
          30 days
        </button>
      </div>

      {list.length === 0 ? (
        <p className="admin-diagnostics__muted">No diagnostic events in this window.</p>
      ) : (
        <div className="admin-diagnostics__list">
          {list.map((issue) => (
            <IssueRow key={issue.issueSignature} issue={issue} />
          ))}
        </div>
      )}
    </section>
  );
}
