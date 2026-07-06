import Icon from '@/components/react/Icon';

/** Author attribution chip for shared-space note list rows — mirrors the inspector "You" chip. */
export default function SharedSpaceNoteAuthorChip({
  displayName,
  color = 'blue',
  isSelf = false,
}: {
  displayName: string;
  color?: string | null;
  isSelf?: boolean;
}) {
  const c = color || 'blue';
  const label = isSelf ? 'You' : displayName;

  return (
    <span
      className="proto-shared-author-chip"
      style={{ '--proto-shared-author-color': `var(--color-${c})` } as React.CSSProperties}
    >
      <Icon name="circle-user" size={11} aria-hidden />
      {label}
    </span>
  );
}
