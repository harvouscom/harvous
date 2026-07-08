import Icon from '@/components/react/Icon';

/** Author attribution chip for shared-space note list rows — mirrors the inspector "You" chip. */
export default function SharedSpaceNoteAuthorChip({
  displayName,
  isSelf = false,
}: {
  displayName: string;
  /** Kept for call-site parity with note author metadata; icon uses chip text color. */
  color?: string | null;
  isSelf?: boolean;
}) {
  const label = isSelf ? 'You' : displayName;

  return (
    <span className="proto-shared-author-chip">
      <Icon name="circle-user" size={11} aria-hidden />
      {label}
    </span>
  );
}
