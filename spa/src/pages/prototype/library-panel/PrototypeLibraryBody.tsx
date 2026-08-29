/**
 * What the Library panel is showing, for a given view.
 *
 * The whole body is this one switch: the view is a value, so "which screen" is a lookup
 * rather than a pile of booleans that can disagree with each other. That is the payoff
 * of `LibraryPanelView` living in shell state — the sidebar's equivalent needed a list
 * mode plus three drilldown fields plus their reset effects, and combinations of those
 * existed that meant nothing.
 *
 * The drill is asked about first, and the tab is what falls through. That order is the
 * shape of the state: a drill sits *on top of* a tab rather than replacing it, so the tab
 * only gets to draw when nothing is stacked above it.
 */
import type { LibraryPanelView } from './library-panel-view';
import PrototypeLibraryFolderView from './PrototypeLibraryFolderView';
import PrototypeLibraryScriptureView from './PrototypeLibraryScriptureView';
import PrototypeLibraryTabView from './PrototypeLibraryTabView';
import PrototypeLibraryThreadView from './PrototypeLibraryThreadView';

export default function PrototypeLibraryBody({ view }: { view: LibraryPanelView }) {
  const { drill } = view;
  if (drill) {
    switch (drill.kind) {
      case 'folder':
        return <PrototypeLibraryFolderView folderKey={drill.folderKey} />;
      case 'thread':
        return <PrototypeLibraryThreadView threadId={drill.threadId} />;
      case 'scripture':
        return <PrototypeLibraryScriptureView drill={drill.drill} />;
    }
  }
  return <PrototypeLibraryTabView tab={view.tab} />;
}
