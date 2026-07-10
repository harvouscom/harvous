import Icon from '@/components/react/Icon';
import type { NoteActivityItem } from '../../lib/shared-note-activity-list';
import { noteActivityKindLabel } from '../../lib/shared-note-activity-list';
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
  const kindLabel = noteActivityKindLabel(item.kind);
  const accessibleStatus = item.statusLabel ? `, ${item.statusLabel}` : '';

  return (
    <li className="proto-inspector-activity__item">
      <button
        type="button"
        className={`proto-inspector-activity__row${isActive ? ' proto-inspector-activity__row--active' : ''}`}
        aria-current={isActive ? 'true' : undefined}
        aria-label={`${kindLabel} by ${actorLabel} on ${item.subject}${accessibleStatus}`}
        onClick={onSelect}
      >
        <span className="proto-inspector-activity__glyph" aria-hidden>
          <Icon name={activityKindIcon(item.kind)} size={11} />
        </span>
        <span className="proto-inspector-activity__body">
          <span className="proto-inspector-activity__head">
            <span className="proto-inspector-activity__kind">{kindLabel}</span>
            {rel ? <span className="proto-inspector-activity__time">{rel}</span> : null}
          </span>
          {item.statusLabel ? (
            <span className="proto-inspector-activity__status">{item.statusLabel}</span>
          ) : null}
          <span className="proto-inspector-activity__subject" title={item.subject}>
            {item.subject}
          </span>
          <span className="proto-inspector-activity__meta">
            <span className="proto-inspector-activity__actor">{actorLabel}</span>
            {item.preview ? (
              <>
                <span className="proto-inspector-activity__sep" aria-hidden>
                  ·
                </span>
                <span className="proto-inspector-activity__preview">{item.preview}</span>
              </>
            ) : null}
          </span>
          {item.context ? <span className="proto-inspector-activity__context">{item.context}</span> : null}
        </span>
      </button>
    </li>
  );
}
