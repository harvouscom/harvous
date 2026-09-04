/**
 * Maps an expanded-sidebar tool key to the surface that renders it.
 *
 * The shell knows only the key, so adding a tool (challenges, reviews) is a
 * case here plus a component — the layout, the animation, and the Back-button
 * handling come free. Each tool renders its own `ProtoSidebarExpandedPanel` so
 * it can fill the header's title, view switcher, and action slots itself.
 */
import type { ProtoExpandRect } from '../../layouts/proto-shell-context';
import PrototypeExpandedPlanner from './planner/PrototypeExpandedPlanner';
import PrototypeExpandedLibraryManager from './library/PrototypeExpandedLibraryManager';

export type ExpandedSidebarToolProps = {
  exiting: boolean;
  /** Where the open came from, so the panel grows out of it. Null keeps the edge unfurl. */
  origin?: ProtoExpandRect | null;
  onClose: () => void;
};

type PrototypeExpandedSidebarHostProps = ExpandedSidebarToolProps & {
  tool: string | null;
};

export default function PrototypeExpandedSidebarHost({
  tool,
  exiting,
  origin,
  onClose,
}: PrototypeExpandedSidebarHostProps) {
  switch (tool) {
    case 'planner':
      return <PrototypeExpandedPlanner exiting={exiting} origin={origin} onClose={onClose} />;
    case 'library':
      return <PrototypeExpandedLibraryManager exiting={exiting} origin={origin} onClose={onClose} />;
    default:
      return null;
  }
}
