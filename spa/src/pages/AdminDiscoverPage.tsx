/**
 * The Discover review queue.
 *
 * Nothing reaches the public catalog without passing through here. Approving
 * asks for a category, because filing is the reviewer's job — the submitter is
 * never shown the taxonomy — and declining asks for a reason, because the
 * person who offered something reads it back in their own sheet.
 */
import { useEffect, useState } from 'react';
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

function SubmissionCard({ row }: { row: DiscoverSubmissionForReview }) {
  const review = useReviewDiscoverSubmission();
  const [category, setCategory] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [official, setOfficial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headings = row.preview?.headings ?? [];

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
    <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
      <div className="proto-church-tools__row">
        <span className="proto-church-tools__row-icon" aria-hidden>
          <Icon name={row.staffReadAt ? 'circle-check' : 'circle-info'} size={13} />
        </span>
        <span className="proto-church-tools__row-text">
          <span className="pds-list-title proto-church-tools__row-title">{row.title}</span>
          <span className="proto-caption proto-church-tools__row-meta">
            {row.kind} · shared by {row.authorDisplayName ?? 'a Harvous user'}
          </span>
        </span>
      </div>

      {row.description ? (
        <p className="proto-caption proto-service-editor__starter-hint">{row.description}</p>
      ) : null}

      {/* The scaffold is the thing being offered, so it is what a reviewer reads. */}
      {headings.length > 0 ? (
        <p className="proto-caption proto-service-editor__starter-hint">
          Sections: {headings.join(' · ')}
        </p>
      ) : null}
      {row.preview?.excerpt ? (
        <p className="proto-caption proto-service-editor__starter-hint">{row.preview.excerpt}</p>
      ) : null}

      <label
        className="proto-inspector-section-title proto-create-folder-sheet__field-label"
        htmlFor={`discover-category-${row.id}`}
      >
        Category
      </label>
      <select
        id={`discover-category-${row.id}`}
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

      {/* Provenance the reviewer asserts, never the submitter — a built-in
          template lives in code and never gets a row to check "is this ours"
          against, so nothing can derive this automatically. */}
      <label className="proto-inspector-templates__check">
        <input
          type="checkbox"
          checked={official}
          onChange={(e) => setOfficial(e.target.checked)}
        />
        <span className="pds-caption">Included with Harvous (not a submitter's work)</span>
      </label>

      <label
        className="proto-inspector-section-title proto-create-folder-sheet__field-label"
        htmlFor={`discover-note-${row.id}`}
      >
        <span>Note back</span>
        <span className="proto-service-editor__optional">optional</span>
      </label>
      <input
        id={`discover-note-${row.id}`}
        type="text"
        className="proto-create-folder-sheet__name-input"
        value={reviewNote}
        placeholder="Why, if you are turning it down"
        maxLength={500}
        onChange={(e) => setReviewNote(e.target.value)}
      />

      {error ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={review.isPending}
          onClick={() => act('approve')}
        >
          {review.isPending ? 'Saving…' : 'Approve and list'}
        </button>
        <button
          type="button"
          className="proto-sheet-quiet-action"
          disabled={review.isPending}
          onClick={() => act('decline')}
        >
          Decline
        </button>
      </div>
    </div>
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
        <p className="proto-caption proto-service-editor__starter-hint">Loading…</p>
      ) : submissions.length === 0 ? (
        <p className="proto-caption proto-service-editor__starter-hint">
          {status === 'submitted' ? 'Nothing waiting.' : 'Nothing here.'}
        </p>
      ) : (
        submissions.map((row) =>
          status === 'submitted' ? (
            <SubmissionCard key={row.id} row={row} />
          ) : (
            <div
              key={row.id}
              className="proto-glass-surface proto-glass-surface--panel proto-church-tools"
            >
              <div className="proto-church-tools__row">
                <span className="proto-church-tools__row-text">
                  <span className="pds-list-title proto-church-tools__row-title">{row.title}</span>
                  <span className="proto-caption proto-church-tools__row-meta">
                    {row.status}
                    {row.category ? ` · ${row.category}` : ''}
                    {row.installCount > 0 ? ` · saved by ${row.installCount}` : ''}
                  </span>
                </span>
              </div>
            </div>
          ),
        )
      )}
    </AdminShell>
  );
}
