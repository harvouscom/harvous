import Icon from '@/components/react/Icon';
import type { NoteActivityItem } from '../../lib/shared-note-activity-list';
import { noteActivityKindVerb } from '../../lib/shared-note-activity-list';
import SharedSpaceMemberAvatar from './SharedSpaceMemberAvatar';
import { protoRelativeCaptionAbbrev } from './proto-time';

function activityKindIcon(kind: NoteActivityItem['kind']): 'highlighter' | 'note-sticky' | 'arrow-right-arrow-left' {
  switch (kind) {
    case 'response':
      return 'note-sticky';
    case 'connection':
      return 'arrow-right-arrow-left';
    case 'highlight':
    default:
      return 'highlighter';
  }
}

export default function ProtoInspectorActivityRow({
  item,
  isActive,
  onSelect,
}: {
  item: NoteActivityItem;
  isActive: boolean;
  onSelect: () => void;
}) {
  const rel = protoRelativeCaptionAbbrev(item.timestamp);
  const actorLabel = item.isSelf ? 'You' : item.actorDisplayName;
  const verb = noteActivityKindVerb(item.kind);
  const accessibleStatus = item.statusLabel ? `, ${item.statusLabel}` : '';

  return (
    <li className="proto-inspector-activity__item">
      <button
        type="button"
        className={`proto-inspector-activity__row${isActive ? ' proto-inspector-activity__row--active' : ''}`}
        aria-current={isActive ? 'true' : undefined}
        aria-label={`${actorLabel} ${verb} ${item.subject}${accessibleStatus}`}
        onClick={onSelect}
      >
        <span className="proto-inspector-activity__meta">
          <SharedSpaceMemberAvatar
            userId={item.actorUserId}
            firstName={item.actorFirstName}
            displayName={item.actorDisplayName}
            userColor={item.actorColor}
            profileImageUrl={item.actorProfileImageUrl}
            className="proto-inspector-activity__avatar"
          />
          <span className="proto-inspector-activity__lead">
            <span className="proto-inspector-activity__actor">{actorLabel}</span>{' '}
            <span className="proto-inspector-activity__verb">{verb}</span>
          </span>
        </span>
        <span className="proto-inspector-activity__detail">
          <span className="proto-inspector-activity__subject-row">
            <span
              className="proto-glass-surface proto-home-greeting__chip proto-inspector-activity__subject-chip"
              title={item.subject}
            >
              <Icon name={activityKindIcon(item.kind)} size={10} aria-hidden />
              <span className="proto-inspector-activity__subject-chip-text">{item.subject}</span>
            </span>
            {rel ? (
              <span className="pds-list-timestamp proto-inspector-activity__time">{rel}</span>
            ) : null}
          </span>
          {item.statusLabel ? (
            <span className="proto-inspector-activity__status">{item.statusLabel}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
