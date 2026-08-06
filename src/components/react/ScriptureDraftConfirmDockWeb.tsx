'use client';

import Icon from '@/components/react/Icon';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import '@/styles/scripture-draft-confirm-dock.css';

export interface ScriptureDraftConfirmDockWebProps {
  preview: string;
  onConfirm: () => void;
}

/** Mobile-only bottom dock row to confirm an inline scripture draft (replaces floating ✓). */
export default function ScriptureDraftConfirmDockWeb({
  preview,
  onConfirm,
}: ScriptureDraftConfirmDockWebProps) {
  const label = preview.trim() || 'Scripture reference';

  return (
    <StudyDockCardShell
      rootClassName="scripture-draft-confirm-dock"
      ariaLabel="Confirm scripture reference"
      accentColor="var(--study-dock-accent-skyBlue, #30a8db)"
      expanded
      animateEnter={false}
      onToggleExpanded={() => {}}
      onDismiss={() => {}}
      headerIcon={<Icon name="scroll" size={13} />}
      headerTitle={
        <span className="scripture-draft-confirm-dock__title study-dock-card__header-primary-text">
          {label}
        </span>
      }
      accentPrimaryAction={{
        label: 'Confirm',
        ariaLabel: 'Confirm scripture reference',
        onClick: onConfirm,
        icon: <Icon name="check" size={14} />,
      }}
    />
  );
}
