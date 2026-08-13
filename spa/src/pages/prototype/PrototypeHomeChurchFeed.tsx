/**
 * Home › "From your church" — newest study from the ministry channels the
 * viewer follows.
 *
 * A study feed, not an announcements bulletin: every row is a note someone on
 * staff published into a channel. Renders nothing at all when the viewer has no
 * home church or follows nothing, so it never occupies Home for the majority of
 * users who aren't connected to a church.
 *
 * Design reference: church gallery scene `07-from-your-church`.
 */
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { toPrototypeSpaceSearchParam } from '../../utils/prototype-space-api-id';
import { useChurchFeed, type ChurchFeedItem } from '../../hooks/queries/useChurchFeed';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { noteParamSlug } from './proto-route-slugs';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';

/** Rows shown on Home; the channel itself holds the full history. */
/**
 * Exported so PrototypeSidebarHomeView can subscribe to the same query for its presentation
 * gate. React Query keys on the params, so a different limit there would mean a *second*
 * request rather than a shared cache read — these two must not drift apart.
 */
export const HOME_FEED_LIMIT = 3;

function ChurchFeedCard({
  item,
  onOpen,
}: {
  item: ChurchFeedItem;
  onOpen: (item: ChurchFeedItem) => void;
}) {
  const title =
    stripServerAutoUntitledNoteTitleForDisplay(item.title?.trim() ?? '') || 'Untitled';
  const rel = protoRelativeCaptionAbbrev(item.publishedAt ?? item.updatedAt ?? null);

  return (
    <button
      type="button"
      className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
      onClick={() => onOpen(item)}
    >
      <div className="proto-home-card__body">
        <div className="proto-home-card__title-row">
          <span className="proto-home-card__icon-orb" aria-hidden>
            <ProtoSpaceMenuIcon
              color={item.channel.color || 'paper'}
              size={28}
              radius={8}
              iconName="rss"
            />
          </span>
          <div className="proto-church-hub__row-text">
            <p className="pds-list-title proto-home-card__title">{title}</p>
            <p className="proto-caption proto-church-hub__row-meta">
              {item.channel.title}
              {rel ? ` · ${rel}` : ''}
            </p>
          </div>
          <span className="proto-home-card__chevron" aria-hidden>
            <Icon name="caret-right" size={11} />
          </span>
        </div>
        {item.excerpt ? (
          <p className="pds-list-preview proto-home-card__preview">{item.excerpt}</p>
        ) : null}
      </div>
    </button>
  );
}

export default function PrototypeHomeChurchFeed() {
  const navigate = useNavigate();
  const { ensureSidebarExpanded } = useProtoShell();
  const { data } = useChurchFeed({ limit: HOME_FEED_LIMIT });

  const items = data?.items ?? [];
  if (!data?.connected || items.length === 0) return null;

  const openItem = (item: ChurchFeedItem) => {
    ensureSidebarExpanded();
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteParamSlug(item.noteId) },
      // The note must open in its channel's context — without the space param
      // it resolves against My Home and the viewer has no access to it there.
      search: { space: toPrototypeSpaceSearchParam(item.channel.id) },
    });
  };

  return (
    <div className="proto-home-section">
      <p className="proto-caption proto-home-section__eyebrow">From your church</p>
      <ul className="proto-church-hub__list">
        {items.map((item) => (
          <li key={`${item.channel.id}:${item.noteId}`}>
            <ChurchFeedCard item={item} onOpen={openItem} />
          </li>
        ))}
      </ul>
    </div>
  );
}
