/**
 * Maps an expanded-sidebar tool key to the surface that renders it.
 *
 * The shell knows only the key, so adding a tool (challenges, reviews) is a
 * case here plus a component — the layout, the animation, and the Back-button
 * handling come free. Each tool renders its own `ProtoSidebarExpandedPanel` so
 * it can fill the header's title, view switcher, and action slots itself.
 */
import PrototypeExpandedPlanner from './planner/PrototypeExpandedPlanner';
import PrototypeExpandedLibraryManager from './library/PrototypeExpandedLibraryManager';

export type ExpandedSidebarToolProps = {
  exiting: boolean;
  onClose: () => void;
};

type PrototypeExpandedSidebarHostProps = ExpandedSidebarToolProps & {
  tool: string | null;
};

export default function PrototypeExpandedSidebarHost({
  tool,
  exiting,
  onClose,
}: PrototypeExpandedSidebarHostProps) {
  switch (tool) {
    case 'planner':
      return <PrototypeExpandedPlanner exiting={exiting} onClose={onClose} />;
    case 'library':
      return <PrototypeExpandedLibraryManager exiting={exiting} onClose={onClose} />;
    default:
      return null;
  }
}
