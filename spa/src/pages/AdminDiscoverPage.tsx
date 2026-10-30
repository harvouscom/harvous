/**
 * The Discover review queue.
 *
 * Nothing reaches the public catalog without passing through here. Approving
 * asks for a category, because filing is the reviewer's job — the submitter is
 * never shown the taxonomy — and declining asks for a reason, because the
 * person who offered something reads it back in their own sheet.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import AdminShell from '@/components/react/AdminShell';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import Icon from '@/components/react/Icon';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';
import { DISCOVER_CATEGORIES } from '@/data/discover-categories';
import {
  useDiscoverSubmissionsForReview,
  type DiscoverSubmissionForReview,
} from '../hooks/queries/useDiscoverListings';
import { useReviewDiscoverSubmission } from '../hooks/mutations/useDiscoverMutations';
import ProtoChipBar from './prototype/components/ProtoChipBar';
import '@/styles/admin-usage.css';
import '@/styles/admin-discover.css';

/** What each kind looks like at a glance — the same glyphs the catalog uses for them. */
const KIND: Record<string, { label: string; icon: 'list-check' | 'note-sticky' | 'layer-group' | 'link' }> = {
  template: { label: 'Template', icon: 'list-check' },
  note: { label: 'Note', icon: 'note-sticky' },
  pack: { label: 'Study pack', icon: 'layer-group' },
  resource: { label: 'Resource', icon: 'link' },
};

function submittedAgo(at: string | Date): string {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return '';
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

function SubmissionCard({ row }: { row: DiscoverSubmissionForReview }) {
  const review = useReviewDiscoverSubmission();
  const [category, setCategory] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [official, setOfficial] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = row.preview;
  const headings = preview?.headings ?? [];
  const titles = preview?.titles ?? [];
  const kind = KIND[row.kind] ?? { label: row.kind, icon: 'note-sticky' as const };
  /*
    The sanitized body (server-side, the same HTML a listing page renders) beats the excerpt:
    the excerpt is the body with its line breaks collapsed, so headings and verses ran into one
    sentence. Memoized — an inline {__html} object re-applies innerHTML on every render.
  */
  const bodyMarkup = useMemo(() => (preview?.bodyHtml ? { __html: preview.bodyHtml } : null), [preview?.bodyHtml]);
  /*
    For a resource the excerpt is filled from its own description (`snapshotResource`), so the
    two would print the same sentence twice; compared rather than special-cased by kind.
  */
  const excerpt =
    preview?.excerpt && preview.excerpt.trim() !== (row.description ?? '').trim() ? preview.excerpt : null;

  const act = (action: 'approve' | 'decline') => {
    if (review.isPending) return;
    if (action === 'approve' && !category) {
      setError('Pick a category to file it under.');
      return;
    }
    setError(null);
    review.mutate(
      {
        listingId: row.id,
        action,
        category: action === 'approve' ? category : null,
        reviewNote: reviewNote.trim() || null,
        official: action === 'approve' ? official : undefined,
      },
      { onError: (err) => setError(err instanceof Error ? err.message : 'Could not save that.') },
    );
  };

  return (
    <article className="proto-glass-surface proto-glass-surface--panel admin-discover-card">
      <header className="admin-discover-card__head">
        <span className="admin-discover-card__glyph" aria-hidden>
          <Icon name={kind.icon} size={15} />
        </span>
        <span className="admin-discover-card__heading">
          <span className="pds-list-title admin-discover-card__title">{row.title}</span>
          <span className="proto-caption admin-discover-card__meta">
            {[
              kind.label,
              `shared by ${row.authorDisplayName ?? 'a Harvous user'}`,
              submittedAgo(row.createdAt),
              row.staffReadAt ? 'opened before' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </header>

      {/*
        Above the artifact, not beside the buttons: this changes whether the thing below is the
        submitter's to give away at all, so it has to be read before anything else about the row.
      */}
      {(row.reviewFlags ?? []).map((flag) => (
        <p key={flag} className="admin-discover-card__flag" role="note">
          <Icon name="circle-exclamation" size={12} aria-hidden />
          <span>{flag}</span>
        </p>
      ))}

      {row.description ? <p className="admin-discover-card__description">{row.description}</p> : null}

      {/* The thing being offered is what a reviewer reads, so it gets the room. */}
      <div className={`admin-discover-card__preview${expanded ? ' admin-discover-card__preview--open' : ''}`}>
        {titles.length > 0 ? (
          <>
            <p className="admin-discover-card__label">
              {preview?.noteCount ?? titles.length} {(preview?.noteCount ?? titles.length) === 1 ? 'note' : 'notes'}
            </p>
            <ol className="admin-discover-card__titles">
              {titles.map((title, index) => (
                <li key={`${index}:${title}`}>{title}</li>
              ))}
            </ol>
          </>
        ) : null}
        {headings.length > 0 ? (
          <div className="admin-discover-card__chips" aria-label="Sections">
            {headings.map((heading) => (
              <span key={heading} className="admin-discover-card__chip">
                {heading}
              </span>
            ))}
          </div>
        ) : null}
        {bodyMarkup ? (
          <div className="admin-discover-card__body" dangerouslySetInnerHTML={bodyMarkup} />
        ) : excerpt ? (
          <p className="admin-discover-card__body">{excerpt}</p>
        ) : null}
      </div>
      {bodyMarkup || (excerpt && excerpt.length > 240) ? (
        <button
          type="button"
          className="proto-sheet-quiet-action admin-discover-card__more"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Read it all'}
        </button>
      ) : null}

      <div className="admin-discover-card__form">
        <label className="admin-discover-card__field">
          <span className="admin-discover-card__label">Category</span>
          <select
            className="proto-create-folder-sheet__name-input"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setError(null);
            }}
          >
            <option value="">Choose one…</option>
            {DISCOVER_CATEGORIES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {/* Provenance the reviewer asserts, never the submitter — a built-in template lives in
            code and never gets a row to check "is this ours" against. */}
        <label className="admin-discover-card__check">
          <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} />
          <span>
            <span className="admin-discover-card__check-title">Made by Harvous</span>
            <span className="admin-discover-card__check-meta">Credit Harvous instead of the person who shared it</span>
          </span>
        </label>

        <label className="admin-discover-card__field">
          <span className="admin-discover-card__label">
            Note back <span className="admin-discover-card__optional">· optional, they see it</span>
          </span>
          <input
            type="text"
            className="proto-create-folder-sheet__name-input"
            value={reviewNote}
            placeholder="Why, if you’re turning it down"
            maxLength={500}
            onChange={(e) => setReviewNote(e.target.value)}
          />
        </label>
      </div>

      {error ? (
        <p className="proto-connect-note-sheet__error admin-discover-card__error" role="alert">
          {error}
        </p>
      ) : null}

      <footer className="admin-discover-card__footer">
        <button
          type="button"
          className="proto-sheet-quiet-action"
          disabled={review.isPending}
          onClick={() => act('decline')}
        >
          Decline
        </button>
        <button
          type="button"
          className="proto-share-popover__primary proto-ink-on-accent"
          disabled={review.isPending}
          onClick={() => act('approve')}
        >
          {review.isPending ? 'Saving…' : 'Approve and list'}
        </button>
      </footer>
    </article>
  );
}

const STATUS_TABS = [
  { id: 'submitted', label: 'Waiting' },
  { id: 'listed', label: 'Listed' },
  { id: 'declined', label: 'Declined' },
] as const;

type StatusTab = (typeof STATUS_TABS)[number]['id'];

export default function AdminDiscoverPage() {
  const navigate = useNavigate();
  const admin = useHarvousAdminCheck();
  const [status, setStatus] = useState<StatusTab>('submitted');
  const queue = useDiscoverSubmissionsForReview(status);

  useEffect(() => {
    if (admin.isError || (admin.isSuccess && admin.data && !admin.data.isAdmin)) {
      navigate({ to: '/' });
    }
  }, [admin.isError, admin.isSuccess, admin.data, navigate]);

  if (admin.isLoading) {
    return (
      <>
        <AdminShell title="Discover">{null}</AdminShell>
        <ProtoStatusChip visible variant="syncing" label="Loading…" />
      </>
    );
  }
  if (!admin.data?.isAdmin) return null;

  const submissions = queue.data?.submissions ?? [];

  return (
    <AdminShell
      title="Discover"
      subtitle="What people have offered to share. Nothing is public until you approve it."
    >
      <ProtoChipBar
        ariaLabel="Submission status"
        options={STATUS_TABS}
        selectedId={status}
        onSelect={setStatus}
      />

      {queue.isLoading ? (
        <p className="proto-caption admin-discover__empty">Loading…</p>
      ) : submissions.length === 0 ? (
        <p className="proto-caption admin-discover__empty">
          {status === 'submitted' ? 'Nothing waiting.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="admin-discover__list">
        {submissions.map((row) =>
          status === 'submitted' ? (
            <SubmissionCard key={row.id} row={row} />
          ) : (
            <article key={row.id} className="proto-glass-surface proto-glass-surface--panel admin-discover-card">
              <header className="admin-discover-card__head">
                <span className="admin-discover-card__glyph" aria-hidden>
                  <Icon name={(KIND[row.kind] ?? KIND.note).icon} size={15} />
                </span>
                <span className="admin-discover-card__heading">
                  <span className="pds-list-title admin-discover-card__title">{row.title}</span>
                  <span className="proto-caption admin-discover-card__meta">
                    {[
                      (KIND[row.kind] ?? { label: row.kind }).label,
                      DISCOVER_CATEGORIES.find((c) => c.id === row.category)?.label ?? row.category,
                      row.installCount > 0 ? `saved by ${row.installCount}` : null,
                      row.status === 'declined' && row.reviewNote ? `“${row.reviewNote}”` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </header>
            </article>
          ),
        )}
        </div>
      )}
    </AdminShell>
  );
}
