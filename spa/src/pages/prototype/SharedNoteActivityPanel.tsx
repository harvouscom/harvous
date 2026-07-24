import { useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNoteActivity } from '../../hooks/queries/useNoteActivity';
import {
  buildSharedNoteActivityGroups,
  type NoteActivityGroup,
  type NoteActivityItem,
} from '../../lib/shared-note-activity-list';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import ProtoInspectorActivityRow from './ProtoInspectorActivityRow';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { PrototypeSectionHeader } from './design-system';

export function SharedNoteActivitySpaceSection({
  group,
  activeActivityId = null,
  onSelectActivity,
}: {
  group: NoteActivityGroup;
  activeActivityId?: string | null;
  onSelectActivity: (item: NoteActivityItem) => void;
}) {
  return (
    <div className="proto-inspector-activity__space-group">
      <header className="proto-inspector-activity__space-header">
        <div className="proto-inspector-activity__space-heading">
          <ProtoSpaceMenuIcon color={group.spaceColor || 'paper'} size={16} radius={5} />
          <p className="proto-inspector-activity__space-name">{group.spaceTitle}</p>
          {group.associationStatus === 'archived' ? (
            <span className="proto-inspector-activity__archived">Archived</span>
          ) : null}
        </div>
      </header>
      <ul className="proto-inspector-activity proto-inspector-activity--trail">
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
  );
}

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
      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Activity</PrototypeSectionHeader>
        <p className="proto-inspector-activity__state" role="status">
          Loading activity…
        </p>
      </section>
    );
  }

  if (activityQuery.isError) {
    return (
      <section className="proto-inspector-section">
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
    <section className="proto-inspector-section">
      <PrototypeSectionHeader>Activity</PrototypeSectionHeader>
      <div className="proto-inspector-activity__groups">
        {groups.map((group) => (
          <SharedNoteActivitySpaceSection
            key={group.spaceId}
            group={group}
            activeActivityId={activeActivityId}
            onSelectActivity={onSelectActivity}
          />
        ))}
      </div>
    </section>
  );
}
