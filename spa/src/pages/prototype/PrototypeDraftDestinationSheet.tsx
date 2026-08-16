/**
 * "Where should this go?" — retarget a draft mid-sentence.
 *
 * Compose from a shared space and the draft saved there, full stop: the destination was a
 * decision you could only make before you started writing, and getting a note back to your
 * own Home meant abandoning it and starting again. The shell has always been able to
 * retarget an in-progress draft (`setComposeTargetSpaceId`) — nothing ever called it.
 *
 * **My Home first, always.** It is the one destination every note can have and the one you
 * are most likely to be reaching for, since the reason to open this is usually "not here".
 *
 * **Only rooms you can actually write in.** A ministry channel you follow appears in the
 * sidebar and would look like a plausible destination, but `canAuthorInSpace` gives a
 * follower `member`, and the server refuses the note. Offering it would be offering a
 * failure — so `public` spaces are listed only where the viewer is owner or leader.
 */
import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import ProtoPopoverShell from './ProtoPopoverShell';
import type { NavSpace } from '../../hooks/queries/useNavigation';

export type DraftDestination = {
  /** Null means My Home — the shell reads an absent override as "the viewer's own space". */
  spaceId: string | null;
  label: string;
  isHome: boolean;
};

/**
 * The rooms a draft may be sent to, My Home first.
 *
 * Pure so the "a follower's channel is never offered" rule is testable without a sidebar,
 * a session or a network.
 */
export function draftDestinationOptions(input: {
  spaces: readonly NavSpace[];
  memberOfSpaces: readonly NavSpace[];
  homeSpaceId: string | null;
}): DraftDestination[] {
  const { spaces, memberOfSpaces, homeSpaceId } = input;
  const seen = new Set<string>();
  const out: DraftDestination[] = [{ spaceId: null, label: 'My Home', isHome: true }];

  for (const space of [...spaces, ...memberOfSpaces]) {
    const id = space.id.startsWith('space_') ? space.id : `space_${space.id}`;
    if (seen.has(id)) continue;
    // My Home is already the first entry; a personal space is that same place.
    if (id === homeSpaceId || (space.type ?? 'personal') === 'personal') continue;
    /* A broadcast channel is authorable by owner/leader only — the same rule
       `canAuthorInSpace` applies server-side. A follower holds `member`. */
    if (space.type === 'public' && space.role !== 'owner' && space.role !== 'leader') continue;
    seen.add(id);
    out.push({ spaceId: id, label: space.title, isHome: false });
  }
  return out;
}

export default function PrototypeDraftDestinationSheet({
  open,
  options,
  currentSpaceId,
  onChoose,
  onDismiss,
}: {
  open: boolean;
  options: DraftDestination[];
  /** Null for My Home. */
  currentSpaceId: string | null;
  onChoose: (destination: DraftDestination) => void;
  onDismiss: () => void;
}) {
  if (!open) return null;

  return (
    <ProtoPopoverShell
      role="menu"
      aria-label="Where this note is saved"
      className="proto-menu__popover proto-draft-destination"
    >
      <div className="proto-menu-section" role="group">
        {options.map((option) => {
          const isCurrent =
            option.spaceId === currentSpaceId || (option.isHome && currentSpaceId === null);
          return (
            <button
              key={option.spaceId ?? '__home__'}
              type="button"
              role="menuitem"
              className="proto-menu-item"
              // Don't steal focus from the editor — the author is mid-sentence.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChoose(option);
                onDismiss();
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                {option.isHome ? (
                  <ProtoHouseIcon size={13} />
                ) : (
                  <Icon name="user-group" size={13} />
                )}
              </span>
              <span className="proto-menu-item__label">{option.label}</span>
              {isCurrent ? (
                <span className="proto-menu-item__trailing" aria-hidden>
                  <Icon name="check" size={11} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </ProtoPopoverShell>
  );
}
