/**
 * What this room studies from.
 *
 * Two lanes arrive here looking identical, which is the point. A church room
 * shows the items the church scoped to it plus the org-wide ones it has not
 * un-pinned; a Shared Space with no church behind it shows the shelf it owns
 * outright. The server decides which, and says whether this viewer may stock
 * it — `canManage`.
 *
 * Curating is inline rather than a trip to the church hub's library manager,
 * because the person who knows what this room should read is standing in the
 * room. Members still see a plain shelf: the add affordances simply are not
 * rendered for them, and the server refuses regardless.
 */
import Icon from '@/components/react/Icon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import {
  useSpaceLibrary,
  useSpaceLibraryActions,
  type SpaceLibraryItem,
} from '../../hooks/queries/useSpaceLibrary';
import { openLibraryFileItem } from '../../hooks/queries/useLibrary';
import { AddResourceForm } from './PrototypeResourceLibraryList';

function itemIcon(item: SpaceLibraryItem) {
  return item.kind === 'file' ? 'paperclip' : 'link';
}

function itemMeta(item: SpaceLibraryItem): string {
  if (item.kind === 'file') return item.fileName || 'File';
  return item.sourceSiteName || item.sourceDomain || 'Link';
}

export default function PrototypeSpaceLibrarySection({ spaceId }: { spaceId: string | null }) {
  const { data, isPending, isError } = useSpaceLibrary(spaceId);
  const actions = useSpaceLibraryActions(spaceId);

  if (isPending) return <ProtoSpaceLoading label="Opening the shelf" />;
  if (isError) {
    return (
      <div className="proto-shared-thread-state" role="alert">
        <p>Could not open this shelf.</p>
      </div>
    );
  }

  const items = data?.items ?? [];
  const canManage = data?.canManage ?? false;

  /* The same form the sidebar library uses, pointed at this room. */
  const addForm = canManage ? (
    <AddResourceForm
      onSaved={() => {}}
      destination={{
        busy: actions.isPending,
        saveLink: (input) => actions.mutateAsync({ kind: 'link', ...input }),
        saveFile: (input) => actions.mutateAsync({ kind: 'upload', ...input }),
      }}
    />
  ) : null;

  if (items.length === 0) {
    return (
      <div className="proto-home-section">
        <PrototypeListEmptyState
          iconName="newspaper"
          title="Nothing on the shelf yet"
          description={
            canManage
              ? 'Add a link or a file and everyone in this space will see it here.'
              : 'Resources added for this room will show up here.'
          }
        />
        {addForm}
      </div>
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
            A link opens straight out; a file mints a signed URL per click, so
            nothing durable to a private file lands in history. Both are
            tappable — the inert file row this used to render was a shelf you
            could read and not open.
          */
          if (item.sourceUrl) {
            return (
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
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              className="proto-church-tools__row"
              onClick={() => {
                void openLibraryFileItem(item.id);
              }}
            >
              {body}
              <span className="proto-church-tools__row-chevron" aria-hidden>
                <Icon name="up-right-and-down-left-from-center" size={11} />
              </span>
            </button>
          );
        })}
      </div>
      {addForm}
    </div>
  );
}
