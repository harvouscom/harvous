import { useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNoteActivity } from '../../hooks/queries/useNoteActivity';
import {
  buildSharedNoteActivityGroups,
  type NoteActivityItem,
} from '../../lib/shared-note-activity-list';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import ProtoInspectorActivityRow from './ProtoInspectorActivityRow';
import { PrototypeSectionHeader } from './design-system';

export default function SharedNoteActivityPanel({
  noteId,
  contextSpaceId,
  noteAuthorUserId,
  noteAuthorDisplayName,
  onSelectActivity,
  activeActivityId = null,
}: {
  noteId: string;
  contextSpaceId?: string | null;
  noteAuthorUserId?: string | null;
  noteAuthorDisplayName?: string | null;
  onSelectActivity: (item: NoteActivityItem) => void;
  activeActivityId?: string | null;
}) {
  const { userId: authUserId } = useAuth();
  const activityQuery = useNoteActivity(noteId, contextSpaceId);
  const groups = useMemo(
    () =>
      buildSharedNoteActivityGroups(activityQuery.data?.groups, {
        noteAuthorUserId,
        noteAuthorDisplayName,
        viewerUserId: authUserId,
        stripHtml: stripHtmlForListPreview,
      }),
    [activityQuery.data?.groups, authUserId, noteAuthorDisplayName, noteAuthorUserId],
  );

  if (activityQuery.isPending) {
    return (
      <section className="proto-inspector-section proto-inspector-section--activity">
        <PrototypeSectionHeader>Activity</PrototypeSectionHeader>
        <p className="proto-inspector-activity__state" role="status">
          Loading activity…
        </p>
      </section>
    );
  }

  if (activityQuery.isError) {
    return (
      <section className="proto-inspector-section proto-inspector-section--activity">
        <PrototypeSectionHeader>Activity</PrototypeSectionHeader>
        <p className="proto-inspector-activity__state proto-inspector-activity__state--error" role="status">
          <span>Activity couldn&apos;t load.</span>
          <button type="button" onClick={() => void activityQuery.refetch()} disabled={activityQuery.isFetching}>
            Retry
          </button>
        </p>
      </section>
    );
  }

  if (groups.length === 0) return null;

  return (
    <section className="proto-inspector-section proto-inspector-section--activity">
      <PrototypeSectionHeader>Activity</PrototypeSectionHeader>
      <div className="proto-inspector-activity__groups">
        {groups.map((group) => (
          <div key={group.spaceId} className="proto-inspector-activity__group">
            <p className="proto-inspector-activity__group-label">
              <span>{group.spaceTitle}</span>
              {group.associationStatus === 'archived' ? (
                <span className="proto-inspector-activity__archived">Archived</span>
              ) : null}
            </p>
            <ul className="proto-inspector-activity">
              {group.items.map((item) => (
                <ProtoInspectorActivityRow
                  key={item.id}
                  item={item}
                  isActive={activeActivityId === item.id}
                  onSelect={() => onSelectActivity(item)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
