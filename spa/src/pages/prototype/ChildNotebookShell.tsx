import type { ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import { ChildNotebookAppearanceProvider } from './ChildNotebookAppearance';
import ChildNotebookHomeMenu from './ChildNotebookHomeMenu';
import ChildNotebookModeMenu from './ChildNotebookModeMenu';
import { useChildBackdropDismiss } from './useChildBackdropDismiss';

export function ChildNotebookPreviewShell({ children }: { children: ReactNode }) {
  return <ChildNotebookAppearanceProvider><ChildNotebookShell>{children}</ChildNotebookShell></ChildNotebookAppearanceProvider>;
}

export default function ChildNotebookShell({ children, onFinish }: { children: ReactNode; onFinish?: () => void }) {
  useChildBackdropDismiss();
  function send(detail: string) {
    window.dispatchEvent(new CustomEvent('harvousChildNotebookPreviewAction', { detail }));
  }
  return <div className="proto-shell-frame simplified-prototype-root">
    <div className="proto-shell proto-theme proto-shell--no-sidebar proto-shell--no-footer pds-kids-shell">
      <header className="proto-shell__toolbar-cell"><div className="proto-shell__toolbar-stack">
        <div className="proto-toolbar-inner">
          <div className="proto-toolbar-left"><div className="proto-toolbar-orb-group" aria-label="Notebook navigation">
            <ChildNotebookHomeMenu />
            <button className="proto-toolbar-icon-btn" aria-label="Bible" title="Open Bible" onClick={() => send('bible')}><Icon name="book-open" size={17} /></button>
            <button className="proto-toolbar-icon-btn" aria-label="Write a note" title="Write a note" onClick={() => send('compose')}><Icon name="pen-to-square" size={17} /></button>
          </div></div>
          <div className="proto-toolbar-center">
            <button type="button" className="proto-toolbar-folder-chip proto-library-chip pds-kids-search-trigger" aria-label="Search" aria-haspopup="dialog" onClick={() => send('search')}>
              <Icon name="magnifying-glass" size={14} /><span className="pds-kids-search-trigger__label">Search</span>
            </button>
          </div>
          <div className="proto-toolbar-right"><ChildNotebookModeMenu onFinish={onFinish} /></div>
        </div>
      </div></header>
      <main className="proto-shell__main-cell"><div className="proto-shell__main-inner">{children}</div></main>
    </div>
  </div>;
}
