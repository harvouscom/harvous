import { useRef } from 'react';
import Icon from '@/components/react/Icon';
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss';
import ProtoPopoverShell from './ProtoPopoverShell';

export default function ChildNotebookHomeMenu() {
  const { open, toggle, close, rootRef } = usePopoverDismiss<HTMLDivElement>();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function goTo(destination: 'home' | 'family') {
    close();
    window.dispatchEvent(new CustomEvent('harvousChildNotebookPreviewAction', { detail: destination }));
  }

  return (
    <div ref={rootRef} className="proto-menu pds-kids-home-menu">
      <button type="button" className="proto-toolbar-icon-btn pds-kids-home-menu__home" aria-label="Home" title="Back to my notebook" onClick={() => goTo('home')}>
        <Icon name="house" size={17} />
      </button>
      <button type="button" ref={triggerRef} className="proto-toolbar-icon-btn pds-kids-home-menu__trigger" aria-label="Home destinations" title="Home destinations" aria-haspopup="menu" aria-expanded={open} onClick={toggle} onKeyDown={event => {
        if (event.key === 'ArrowDown' && !open) { event.preventDefault(); toggle(); }
      }}>
        <Icon name="caret-down" size={10} />
      </button>
      {open && (
        <ProtoPopoverShell className="proto-menu__popover" role="menu" aria-label="Home destinations" onKeyDown={event => {
          if (event.key === 'Escape') { close(); triggerRef.current?.focus(); }
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        }}>
          <button type="button" className="proto-menu-item" role="menuitem" autoFocus onClick={() => goTo('home')}>
            <Icon name="house" size={14} /><span className="proto-menu-item__label">My notebook</span>
          </button>
          <button type="button" className="proto-menu-item" role="menuitem" onClick={() => goTo('family')}>
            <Icon name="user-group" size={14} /><span className="proto-menu-item__label">Family Space</span>
          </button>
        </ProtoPopoverShell>
      )}
    </div>
  );
}
