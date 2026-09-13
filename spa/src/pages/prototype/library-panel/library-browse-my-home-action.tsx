/**
 * "Browse My Home" — the way out of an empty room.
 *
 * Inside a shared space the panel opens on the room, and a room nothing has been shared into
 * yet opens on an empty state. That emptiness is true of the room and not of your library, and
 * a panel whose field reads "Search my Harvous" should not leave the reader to spot the switch
 * above it to learn the difference. So the empty state carries the switch's other half.
 *
 * Only on the room's side of a shared space. On My Home — the shell's or the switch's — an
 * empty list really is your library, and a button to Home from Home goes where you already are.
 *
 * A function returning the element or nothing, not a component that renders null: the empty
 * state wraps whatever `action` it is given, and an element that renders nothing would still
 * leave that wrapper's spacing under the text.
 *
 * Its own file, away from `library-panel-lists`, so an empty state can import it without pulling
 * in the mutation hooks those lists carry.
 */
import type { ReactNode } from 'react';
/* My Home's own glyph, the one its switcher trigger wears — it is a component rather than an
   `Icon` name, so the house here is the same house as there. */
import ProtoHouseIcon from '../ProtoHouseIcon';
import type { LibraryPanelData } from './library-panel-data';

export function libraryBrowseMyHomeAction(
  data: Pick<LibraryPanelData, 'shellIsSharedSpace' | 'viewingHome' | 'homeSpaceId' | 'setListScope'>,
): ReactNode {
  if (!data.shellIsSharedSpace || data.viewingHome || !data.homeSpaceId) return null;
  return (
    <button
      type="button"
      className="proto-glass-surface proto-glass-surface--control proto-glass-action"
      onClick={() => data.setListScope('my-home')}
    >
      <span aria-hidden>
        <ProtoHouseIcon size={12} />
      </span>
      <span className="proto-glass-action__label">Browse My Home</span>
    </button>
  );
}
