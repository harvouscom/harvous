import React, { useEffect, useState } from 'react';
import {
  useAdminSupportTicket,
  useAdminSupportTickets,
  useUpdateSupportTicket,
  type SupportTicketListFilter,
  type SupportTicketListItem,
} from '@/hooks/queries/useAdminSupport';
import { buildTicketReplyMailto } from '@/utils/support-mailto';
import { formatSupportTicketRef } from '@/utils/support-tickets';
import '@/styles/admin-usage.css';
import '@/styles/admin-support.css';

function SupportGlassChip({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={`proto-glass-surface proto-home-greeting__chip admin-support__chip${muted ? ' admin-support__chip--muted' : ''}`}
    >
      {children}
    </span>
  );
}

function SupportFilterChipBar({
  filter,
  onFilter,
}: {
  filter: SupportTicketListFilter;
  onFilter: (next: SupportTicketListFilter) => void;
}) {
  const filters: { key: SupportTicketListFilter; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'all', label: 'All' },
    { key: 'closed', label: 'Closed' },
  ];

  return (
    <div className="proto-chip-bar admin-support__chip-bar" role="tablist" aria-label="Ticket filter">
      {filters.map((f) => {
        const selected = filter === f.key;
        return (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`proto-chip${selected ? ' proto-chip--selected' : ''}`}
            onClick={() => onFilter(f.key)}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

function SupportInboxIntro({ unreadCount, openCount }: { unreadCount: number; openCount: number }) {
  if (openCount === 0 && unreadCount === 0) {
    return (
      <p className="proto-home-greeting admin-support__intro">
        No open tickets right now.
      </p>
    );
  }

  if (unreadCount > 0 && openCount === 0) {
    return (
      <p className="proto-home-greeting admin-support__intro">
        No open tickets —{' '}
        <SupportGlassChip>
          {unreadCount} unread
        </SupportGlassChip>{' '}
        in closed tickets.
      </p>
    );
  }

  if (unreadCount > 0) {
    return (
      <p className="proto-home-greeting admin-support__intro">
        You have{' '}
        <SupportGlassChip>
          {unreadCount} unread
        </SupportGlassChip>
        {openCount > unreadCount ? (
          <>
            {' '}
            and{' '}
            <SupportGlassChip>
              {openCount} open
            </SupportGlassChip>
          </>
        ) : null}{' '}
        in your inbox.
      </p>
    );
  }

  return (
    <p className="proto-home-greeting admin-support__intro">
      All caught up on unread —{' '}
      <SupportGlassChip>
        {openCount} open
      </SupportGlassChip>{' '}
      {openCount === 1 ? 'ticket' : 'tickets'} awaiting reply.
    </p>
  );
}

function formatWhen(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function relativeWhen(iso: string): string {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  } catch {
    return iso;
  }
}

function messagePreview(message: string): string {
  const line = message.trim().split('\n')[0] ?? '';
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

function TicketListRow({
  ticket,
  selected,
  onSelect,
}: {
  ticket: SupportTicketListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const ticketRef = formatSupportTicketRef(ticket.ticketNumber, ticket.id);

  return (
    <button
      type="button"
      className={`admin-support__row${ticket.unread ? ' admin-support__row--unread' : ''}`}
      data-active={selected ? 'true' : 'false'}
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
    >
      <div className="admin-support__row-top">
        {ticket.unread ? <span className="admin-support__unread-dot" aria-hidden /> : null}
        <span className="admin-support__ticket-ref">#{ticketRef}</span>
        {ticket.topic ? <SupportGlassChip>{ticket.topic}</SupportGlassChip> : null}
        <SupportGlassChip muted={ticket.status === 'closed'}>
          {ticket.status === 'open' ? 'Open' : 'Closed'}
        </SupportGlassChip>
        <span className="admin-support__when">{relativeWhen(ticket.createdAt)}</span>
      </div>
      <p className="admin-support__preview">{messagePreview(ticket.message)}</p>
      <p className="admin-support__user">
        {ticket.userName || 'Unknown user'}
        {ticket.userEmail ? ` · ${ticket.userEmail}` : ''}
      </p>
    </button>
  );
}

function TicketDetail({ ticketId, onClose }: { ticketId: string; onClose?: () => void }) {
  const detail = useAdminSupportTicket(ticketId);
  const update = useUpdateSupportTicket();
  const [adminNote, setAdminNote] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);

  const ticket = detail.data?.ticket;

  useEffect(() => {
    if (ticket && !noteDirty) {
      setAdminNote(ticket.adminNote ?? '');
    }
  }, [ticket, noteDirty]);

  if (detail.isLoading) {
    return <p className="admin-support__muted">Loading ticket…</p>;
  }

  if (detail.isError) {
    return <p className="admin-support__error">{detail.error.message}</p>;
  }

  if (!ticket) {
    return <p className="admin-support__muted">Ticket not found.</p>;
  }

  const setStatus = (status: 'open' | 'closed') => {
    update.mutate({ id: ticket.id, status });
  };

  const saveNote = () => {
    update.mutate(
      { id: ticket.id, adminNote },
      {
        onSuccess: () => {
          setNoteDirty(false);
          window.toast?.success('Note saved');
        },
        onError: (err) => window.toast?.error(err.message),
      },
    );
  };

  const ticketRef = formatSupportTicketRef(ticket.ticketNumber, ticket.id);

  const replyHref =
    ticket.userEmail &&
    buildTicketReplyMailto({
      ticketNumber: ticket.ticketNumber,
      ticketId: ticket.id,
      userEmail: ticket.userEmail,
      topic: ticket.topic as 'Bug' | 'Idea' | 'Question' | null,
      originalMessage: ticket.message,
    });

  return (
    <article className="admin-support__detail">
      {onClose ? (
        <button type="button" className="admin-support__back" onClick={onClose}>
          Back to list
        </button>
      ) : null}

      <header className="admin-support__detail-header">
        <div className="admin-support__detail-meta">
          {ticket.topic ? <SupportGlassChip>{ticket.topic}</SupportGlassChip> : null}
          <SupportGlassChip muted={ticket.status === 'closed'}>
            {ticket.status === 'open' ? 'Open' : 'Closed'}
          </SupportGlassChip>
          {ticket.unread ? <SupportGlassChip>Unread</SupportGlassChip> : null}
        </div>
        <h2 className="admin-support__detail-user">{ticket.userName || 'Unknown user'}</h2>
        {ticket.userEmail ? <p className="admin-support__detail-email">{ticket.userEmail}</p> : null}
        <p className="admin-support__detail-when">{formatWhen(ticket.createdAt)}</p>
      </header>

      <div className="admin-support__message">
        <p className="admin-support__message-label">Message</p>
        <p className="admin-support__message-body">{ticket.message}</p>
      </div>

      <dl className="admin-support__facts">
        {ticket.appVersion ? (
          <>
            <dt>App version</dt>
            <dd>{ticket.appVersion}</dd>
          </>
        ) : null}
        {ticket.pageUrl ? (
          <>
            <dt>Page</dt>
            <dd>
              <a href={ticket.pageUrl} target="_blank" rel="noopener noreferrer">
                {ticket.pageUrl}
              </a>
            </dd>
          </>
        ) : null}
        {ticket.clientEnvironment ? (
          <>
            <dt>Device</dt>
            <dd>{ticket.clientEnvironment}</dd>
          </>
        ) : null}
        <dt>Ticket</dt>
        <dd>#{ticketRef}</dd>
      </dl>

      <div className="admin-support__note">
        <label className="admin-support__note-label" htmlFor={`admin-note-${ticket.id}`}>
          Internal note
        </label>
        <textarea
          id={`admin-note-${ticket.id}`}
          className="admin-support__note-input"
          value={adminNote}
          onChange={(e) => {
            setAdminNote(e.target.value);
            setNoteDirty(true);
          }}
          rows={3}
          placeholder="Private notes for triage…"
        />
        <button
          type="button"
          className="admin-action-btn"
          onClick={saveNote}
          disabled={!noteDirty || update.isPending}
        >
          {update.isPending ? 'Saving…' : 'Save note'}
        </button>
      </div>

      <div className="admin-support__actions">
        {replyHref ? (
          <a className="proto-settings-btn admin-support__reply-link" href={replyHref}>
            Reply via email
          </a>
        ) : (
          <span className="admin-support__muted">No email on file for reply.</span>
        )}
        {ticket.status === 'open' ? (
          <button
            type="button"
            className="admin-action-btn"
            onClick={() => setStatus('closed')}
            disabled={update.isPending}
          >
            Mark closed
          </button>
        ) : (
          <button
            type="button"
            className="admin-action-btn"
            onClick={() => setStatus('open')}
            disabled={update.isPending}
          >
            Reopen
          </button>
        )}
        {!ticket.unread ? (
          <button
            type="button"
            className="admin-action-btn"
            onClick={() => update.mutate({ id: ticket.id, read: false })}
            disabled={update.isPending}
          >
            Mark as unread
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function AdminSupportPanel() {
  const [filter, setFilter] = useState<SupportTicketListFilter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useAdminSupportTickets(filter);
  const updateTicket = useUpdateSupportTicket();

  const tickets = list.data?.tickets ?? [];
  const openCount = list.data?.openCount ?? 0;
  const unreadCount = list.data?.unreadCount ?? 0;

  useEffect(() => {
    if (selectedId && !tickets.some((t) => t.id === selectedId)) {
      setSelectedId(null);
    }
  }, [tickets, selectedId]);

  if (list.isLoading) {
    return <p className="admin-support__muted">Loading support inbox…</p>;
  }

  if (list.isError) {
    return <p className="admin-support__error">{list.error.message}</p>;
  }

  return (
    <div className="admin-support">
      <SupportFilterChipBar
        filter={filter}
        onFilter={(next) => {
          setFilter(next);
          setSelectedId(null);
        }}
      />

      <div className={`admin-support__layout${selectedId ? ' admin-support__layout--detail' : ''}`}>
        <div className="admin-support__list" aria-label="Support tickets">
          {tickets.length === 0 ? (
            <SupportInboxIntro unreadCount={unreadCount} openCount={openCount} />
          ) : (
            tickets.map((ticket) => (
              <TicketListRow
                key={ticket.id}
                ticket={ticket}
                selected={selectedId === ticket.id}
                onSelect={() => {
                  if (ticket.unread) {
                    updateTicket.mutate({ id: ticket.id, read: true });
                  }
                  setSelectedId(ticket.id);
                }}
              />
            ))
          )}
        </div>

        {selectedId ? (
          <div className="admin-support__detail-pane">
            <TicketDetail ticketId={selectedId} onClose={() => setSelectedId(null)} />
          </div>
        ) : (
          <div className="admin-support__detail-pane admin-support__detail-pane--empty">
            <p className="admin-support__muted">Select a ticket to view details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
