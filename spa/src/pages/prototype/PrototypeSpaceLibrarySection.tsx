/**
 * What this room studies from.
 *
 * The shelf the church curates *for this space* — items scoped to the room,
 * plus the church's org-wide ones it has not un-pinned. Read-only here on
 * purpose: curating belongs to whoever runs the room, in the church hub's
 * library manager, and a member opening this is asking "what should I read",
 * not "what should we stock".
 *
 * Renders nothing for a room with no church behind it: the endpoint answers
 * with an empty shelf rather than an error, and an empty panel in a personal
 * Shared Space would be noise.
 */
import Icon from '@/components/react/Icon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import {
  useSpaceLibrary,
  type SpaceLibraryItem,
} from '../../hooks/queries/useSpaceLibrary';

function itemIcon(item: SpaceLibraryItem) {
  return item.kind === 'file' ? 'paperclip' : 'link';
}

function itemMeta(item: SpaceLibraryItem): string {
  if (item.kind === 'file') return item.fileName || 'File';
  return item.sourceSiteName || item.sourceDomain || 'Link';
}

export default function PrototypeSpaceLibrarySection({ spaceId }: { spaceId: string | null }) {
  const { data, isPending, isError } = useSpaceLibrary(spaceId);

  if (isPending) return <ProtoSpaceLoading label="Opening the shelf" />;
  if (isError) {
    return (
      <div className="proto-shared-thread-state" role="alert">
        <p>Could not open this shelf.</p>
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="newspaper"
        title="Nothing on the shelf yet"
        description="Resources your church adds for this room will show up here."
      />
    );
  }

  return (
    <div className="proto-home-section">
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
        {items.map((item) => {
          const body = (
            <>
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name={itemIcon(item)} size={13} />
              </span>
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title">{item.title}</span>
                <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                  {/* Says where it came from before you open it — the thing a
                      bare title cannot tell you. */}
                  {itemMeta(item)}
                  {item.pinned ? ' · Pinned' : ''}
                </span>
              </span>
            </>
          );

          /*
            A link opens out of the app, a file does not have a URL to open from
            here (it needs a signed URL the manager mints), so only links are
            tappable. An inert row beats a button that goes nowhere.
          */
          return item.sourceUrl ? (
            <a
              key={item.id}
              className="proto-church-tools__row"
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {body}
              <span className="proto-church-tools__row-chevron" aria-hidden>
                <Icon name="up-right-and-down-left-from-center" size={11} />
              </span>
            </a>
          ) : (
            <div key={item.id} className="proto-church-tools__row proto-church-tools__row--status">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
