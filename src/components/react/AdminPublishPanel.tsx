import React, { useState } from 'react';
import {
  useAdminContentSpaces,
  useAdminContentThreads,
  useCreateAdminSpace,
  useCreateAdminThread,
  useCreateAdminNote,
  useGrantAdminSpaceMember,
  useAddSpaceToFeatured,
  type AdminContentSpace,
} from '@/hooks/queries/useAdminPublish';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import Icon from '@/components/react/Icon';
import { THREAD_COLORS, type ThreadColor } from '@/utils/colors';
import '@/styles/admin-usage.css';
import '@/styles/admin-publish.css';

/** Flip to false when publish tooling is ready again. */
const ADMIN_PUBLISH_PAUSED = true;

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text).then(() => {
    window.toast?.success('Copied to clipboard');
  });
}

function NewSpaceForm({ onCreated }: { onCreated: () => void }) {
  const create = useCreateAdminSpace();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<ThreadColor>('paper');
  const [isFeatured, setIsFeatured] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), description: description.trim() || null, color, isFeatured },
      {
        onSuccess: () => {
          window.toast?.success('Space created');
          setTitle('');
          setDescription('');
          setColor('paper');
          setIsFeatured(false);
          onCreated();
        },
        onError: (err) => window.toast?.error(err.message),
      },
    );
  };

  return (
    <form className="admin-publish__form" onSubmit={onSubmit}>
      <div className="admin-publish__field">
        <label className="admin-publish__label" htmlFor="new-space-title">
          Title
        </label>
        <input
          id="new-space-title"
          className="admin-publish__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={100}
        />
      </div>
      <div className="admin-publish__field">
        <label className="admin-publish__label" htmlFor="new-space-desc">
          Description
        </label>
        <input
          id="new-space-desc"
          className="admin-publish__input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="admin-publish__field">
        <label className="admin-publish__label" htmlFor="new-space-color">
          Color
        </label>
        <select
          id="new-space-color"
          className="admin-publish__select"
          value={color}
          onChange={(e) => setColor(e.target.value as ThreadColor)}
        >
          {THREAD_COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <label className="admin-publish__checkbox-row">
        <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
        Featured space
      </label>
      <button type="submit" className="admin-action-btn admin-action-btn--emphasis" disabled={create.isPending}>
        {create.isPending ? 'Creating…' : 'Create space'}
      </button>
    </form>
  );
}

function AddThreadForm({ spaceId }: { spaceId: string }) {
  const create = useCreateAdminThread(spaceId);
  const [title, setTitle] = useState('');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="admin-action-btn" onClick={() => setOpen(true)}>
        Add thread
      </button>
    );
  }

  return (
    <form
      className="admin-publish__inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        create.mutate(
          { title: title.trim() },
          {
            onSuccess: () => {
              window.toast?.success('Thread created');
              setTitle('');
              setOpen(false);
            },
            onError: (err) => window.toast?.error(err.message),
          },
        );
      }}
    >
      <input
        className="admin-publish__input"
        placeholder="Thread title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <div className="admin-publish__actions">
        <button type="submit" className="admin-action-btn admin-action-btn--emphasis" disabled={create.isPending}>
          Save thread
        </button>
        <button type="button" className="admin-action-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddNoteForm({ spaceId, threadId }: { spaceId: string; threadId: string }) {
  const create = useCreateAdminNote(threadId, spaceId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('<p></p>');
  const [noteType, setNoteType] = useState('default');

  if (!open) {
    return (
      <button type="button" className="admin-action-btn" onClick={() => setOpen(true)}>
        Add note
      </button>
    );
  }

  return (
    <form
      className="admin-publish__inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          { title: title.trim() || null, content, noteType },
          {
            onSuccess: () => {
              window.toast?.success('Note created');
              setTitle('');
              setContent('<p></p>');
              setOpen(false);
            },
            onError: (err) => window.toast?.error(err.message),
          },
        );
      }}
    >
      <input
        className="admin-publish__input"
        placeholder="Note title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={50}
      />
      <select className="admin-publish__select" value={noteType} onChange={(e) => setNoteType(e.target.value)}>
        <option value="default">Default</option>
        <option value="scripture">Scripture</option>
        <option value="resource">Resource</option>
      </select>
      <textarea
        className="admin-publish__textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="HTML content"
        required
      />
      <div className="admin-publish__actions">
        <button type="submit" className="admin-action-btn admin-action-btn--emphasis" disabled={create.isPending}>
          Save note
        </button>
        <button type="button" className="admin-action-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SpaceCard({ space }: { space: AdminContentSpace }) {
  const [expanded, setExpanded] = useState(false);
  const threads = useAdminContentThreads(expanded ? space.id : null);
  const grantMember = useGrantAdminSpaceMember(space.id);
  const addFeatured = useAddSpaceToFeatured();
  const [memberUserId, setMemberUserId] = useState('');
  const [featuredMsg, setFeaturedMsg] = useState<string | null>(null);

  const onGrantMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberUserId.trim()) return;
    grantMember.mutate(
      { userId: memberUserId.trim() },
      {
        onSuccess: () => {
          window.toast?.success('Member granted');
          setMemberUserId('');
        },
        onError: (err) => window.toast?.error(err.message),
      },
    );
  };

  const onAddFeatured = () => {
    if (!space.shareToken) return;
    setFeaturedMsg(null);
    addFeatured.mutate(
      {
        contentType: 'space',
        title: space.title,
        description: space.description,
        shareToken: space.shareToken,
        color: space.color,
        isActive: true,
      },
      {
        onSuccess: () => setFeaturedMsg('Added to For You carousel.'),
        onError: (err) => setFeaturedMsg(err.message),
      },
    );
  };

  return (
    <article className="admin-publish__space-card">
      <div
        className="admin-publish__space-header"
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
        <span className="admin-publish__space-title">{space.title}</span>
        <span className="admin-publish__space-meta">
          {space.threadCount} threads · {space.noteCount} notes · {space.memberCount} members
        </span>
        {space.isFeatured ? <span className="admin-publish__badge">Featured</span> : null}
        <Icon name={expanded ? 'caret-up' : 'caret-down'} size={12} aria-hidden />
      </div>

      {expanded ? (
        <div className="admin-publish__space-body">
          {space.joinUrl ? (
            <div className="admin-publish__link-row">
              Join link: {space.joinUrl}
            </div>
          ) : null}

          <div className="admin-publish__actions">
            {space.joinUrl ? (
              <>
                <button type="button" className="admin-action-btn" onClick={() => copyToClipboard(space.joinUrl!)}>
                  Copy join link
                </button>
                <a className="admin-action-btn" href={space.joinUrl} target="_blank" rel="noreferrer">
                  Open join page
                </a>
              </>
            ) : null}
            {space.shareToken ? (
              <button
                type="button"
                className="admin-action-btn"
                onClick={onAddFeatured}
                disabled={addFeatured.isPending}
              >
                Add to For You
              </button>
            ) : null}
          </div>

          {featuredMsg ? (
            <p
              className={`admin-publish__message${featuredMsg.includes('Added') ? ' admin-publish__message--success' : ' admin-publish__message--error'}`}
            >
              {featuredMsg}
            </p>
          ) : null}

          <form className="admin-publish__inline-form" onSubmit={onGrantMember}>
            <label className="admin-publish__label" htmlFor={`member-${space.id}`}>
              Grant member (Clerk user ID)
            </label>
            <div className="admin-publish__actions">
              <input
                id={`member-${space.id}`}
                className="admin-publish__input"
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value)}
                placeholder="user_…"
              />
              <button type="submit" className="admin-action-btn" disabled={grantMember.isPending}>
                Grant
              </button>
            </div>
          </form>

          <AddThreadForm spaceId={space.id} />

          {threads.isLoading ? <p className="admin-publish__space-meta">Loading threads…</p> : null}
          {threads.data?.threads.map((thread) => (
            <div key={thread.id} className="admin-publish__thread">
              <div className="admin-publish__thread-title">{thread.title}</div>
              <div className="admin-publish__space-meta">{thread.noteCount} notes</div>
              <AddNoteForm spaceId={space.id} threadId={thread.id} />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function AdminPublishPanel() {
  const spaces = useAdminContentSpaces();
  const [showNewSpace, setShowNewSpace] = useState(false);

  if (spaces.isLoading) {
    return <ProtoStatusChip visible variant="syncing" label="Loading curated spaces…" />;
  }

  if (spaces.isError) {
    return <p className="admin-publish__message admin-publish__message--error">{spaces.error.message}</p>;
  }

  const list = spaces.data?.spaces ?? [];

  return (
    <div className={`admin-publish-shell${ADMIN_PUBLISH_PAUSED ? ' admin-publish-shell--paused' : ''}`}>
      {ADMIN_PUBLISH_PAUSED ? (
        <p className="admin-publish__paused-notice" role="status">
          Publish is temporarily read-only. You can browse curated spaces, but creating and editing is paused
          right now.
        </p>
      ) : null}
      <div className="admin-publish__paused-content" aria-disabled={ADMIN_PUBLISH_PAUSED || undefined}>
        <div className="admin-usage__board">
          <div className="admin-publish__hero" aria-label="Publishing summary">
            <div className="admin-publish__hero-stat">
              <div className="admin-publish__hero-value">{list.length}</div>
              <div className="admin-publish__hero-label">Curated spaces</div>
            </div>
          </div>

          <div className="admin-publish__toolbar">
            <button
              type="button"
              className="admin-action-btn admin-action-btn--emphasis"
              onClick={() => setShowNewSpace((v) => !v)}
            >
              {showNewSpace ? 'Hide form' : 'New space'}
            </button>
          </div>

          {showNewSpace ? <NewSpaceForm onCreated={() => setShowNewSpace(false)} /> : null}

          {list.length === 0 ? (
            <p className="admin-publish__empty">No curated spaces yet. Create one to get a shareable join link.</p>
          ) : (
            <div className="admin-publish__space-list">
              {list.map((space) => (
                <SpaceCard key={space.id} space={space} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
