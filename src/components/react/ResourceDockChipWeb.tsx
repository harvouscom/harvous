'use client';

import Icon from '@/components/react/Icon';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import type { ResourceDockSession } from '@/utils/study-dock-stack';
import { resourceFileLabel, resourceSourceLabel } from '@/utils/resource-source-label';
import '@/styles/resource-dock-chip.css';

/**
 * A Resource Library item docked beside a note — a chip, never a card.
 *
 * The other dock kinds expand because Harvous can render what they hold. A
 * resource points somewhere else, so there is nothing to expand into that
 * would beat the destination itself; activating the chip goes there and leaves
 * the chip docked for the next time.
 */
export default function ResourceDockChipWeb({
  session,
  onDismiss,
  onOpenFile,
}: {
  session: ResourceDockSession;
  onDismiss: () => void;
  /** kind='file': resolve a signed URL and open it (files have no durable URL). */
  onOpenFile?: (libraryItemId: string) => void;
}) {
  const isFile = session.kind === 'file';
  // The chip is the only thing standing between a tap and leaving the app, so it
  // names the destination rather than just the title — the host for links, the
  // type and weight for files.
  const source = isFile
    ? resourceFileLabel(session.fileMime, session.fileBytes, session.fileName)
    : resourceSourceLabel(session.domain);
  const open = () => {
    if (isFile) {
      onOpenFile?.(session.libraryItemId);
      return;
    }
    if (!session.url) return;
    window.open(session.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <StudyDockCardShell
      accentColor="var(--study-dock-accent-resource, var(--pds-text-muted))"
      expanded={false}
      collapsedOnly
      onToggleExpanded={open}
      onDismiss={onDismiss}
      ariaLabel={
        isFile
          ? `Resource: ${session.title}, opens file ${session.fileName ?? ''}`.trim()
          : source
            ? `Resource: ${session.title}, opens ${source} in a new tab`
            : `Resource: ${session.title}`
      }
      rootClassName="resource-dock-chip"
      headerIcon={<Icon name="newspaper" size={12} />}
      headerTitle={
        // Title + source chip, same shape as the scripture dock's reference +
        // translation pair, so the dock headers read as one family.
        <span className="resource-dock-chip__header-label">
          <span
            className="study-dock-card__header-primary-text resource-dock-chip__title"
            title={session.title}
          >
            {session.title}
          </span>
          {source ? (
            <span
              className="resource-dock-chip__source"
              title={isFile ? session.fileName ?? undefined : session.url}
            >
              {source}
            </span>
          ) : null}
        </span>
      }
    />
  );
}
