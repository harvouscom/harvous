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
import PrototypeHomeRow from './PrototypeHomeRow';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { toPrototypeSpaceSearchParam } from '../../utils/prototype-space-api-id';
import { useChurchFeed, type ChurchFeedItem } from '../../hooks/queries/useChurchFeed';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { noteParamSlug } from './proto-route-slugs';
import PrototypeMinistryPicker from './PrototypeMinistryPicker';
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

  // The channel's own tile stands in for the neutral block: this note came from a room
  // with a colour, and the row should say which. The excerpt joins the meta line rather
  // than taking a line of its own — a row is a row.
  return (
    <PrototypeHomeRow
      icon="rss"
      iconNode={
        <ProtoSpaceMenuIcon
          color={item.channel.color || 'paper'}
          size={26}
          radius={8}
          iconName="rss"
        />
      }
      title={title}
      meta={['From your church', item.channel.title, rel, item.excerpt]}
      onClick={() => onOpen(item)}
    />
  );
}

export default function PrototypeHomeChurchFeed() {
  const navigate = useNavigate();
  const { ensureSidebarExpanded } = useProtoShell();
  const { data } = useChurchFeed({ limit: HOME_FEED_LIMIT });

  const items = data?.items ?? [];
  if (!data?.connected) return null;

  /*
    Connected, but nothing here — which for a fresh congregant means they follow
    no channels yet, because connect deliberately does not auto-follow.

    Offering the ministries *here* is the point: this is where the consequence
    of following nothing is visible, so the prompt costs nothing to ignore and
    explains itself. The picker renders nothing when there is nothing to offer,
    so a church with no channels still collapses to the old empty behaviour.
  */
  if (items.length === 0) return <PrototypeMinistryPicker />;

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

  // Rows of the Following group, not a group of their own: the heading this used to carry
  // ("From your church") is the first meta item on each row now, so the panel above stays
  // one panel and nothing inside it grows a second heading.
  return (
    <>
      {items.map((item) => (
        <ChurchFeedCard key={`${item.channel.id}:${item.noteId}`} item={item} onOpen={openItem} />
      ))}
    </>
  );
}
