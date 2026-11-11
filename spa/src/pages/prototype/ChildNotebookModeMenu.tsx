import { ChildNotebookAvatar } from './ChildNotebookAppearance';
import { useEffect, useRef } from 'react';
import Icon from '@/components/react/Icon';
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss';
import ProtoPopoverShell from './ProtoPopoverShell';

/** Design-preview menu. Real child sessions never use an adult account menu. */
export default function ChildNotebookModeMenu() {
  const { open, toggle, close, rootRef } = usePopoverDismiss<HTMLDivElement>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  function act(action: string) {
    close();
    window.dispatchEvent(new CustomEvent('harvousChildNotebookPreviewAction', { detail: action }));
  }
  return <div ref={rootRef} className="proto-menu pds-kids-mode-menu">
    <button id="child-notebook-mode-trigger" ref={triggerRef} className="proto-toolbar-icon-btn pds-kids-mode-trigger" aria-haspopup="menu" aria-expanded={open} aria-label="Sam, child mode. Open notebook menu" onClick={toggle} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) toggle(); }
    }}>
      <ChildNotebookAvatar small /><span className="pds-kids-mode-trigger__text"><strong>Sam</strong></span>
      <Icon name="caret-down" size={10} />
    </button>
    {open && <ProtoPopoverShell className="proto-menu__popover proto-menu__popover--right proto-menu__popover--account" role="menu" aria-label="Child notebook" onKeyDown={event => {
      if (event.key === 'Escape') { close(); triggerRef.current?.focus(); }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }}>
      <div className="proto-account-menu__identity"><ChildNotebookAvatar /><span className="proto-account-menu__text"><span className="pds-list-title">Sam’s notebook</span><span className="pds-list-preview">Child mode</span></span></div>
      <div className="proto-menu-section" role="group" aria-label="Notebook">
        <button className="proto-menu-item" role="menuitem" autoFocus onClick={() => act('settings')}><Icon name="gear" size={14} /><span className="proto-menu-item__label">Settings</span></button>
        <button className="proto-menu-item" role="menuitem" onClick={() => act('privacy')}><Icon name="user-shield" size={14} /><span className="proto-menu-item__label">Who can see my notebook?</span></button>
      </div>
      <div className="proto-menu-section" role="group" aria-label="Parent access">
        <button className="proto-menu-item" role="menuitem" onClick={() => act('parent')}><Icon name="arrow-right-arrow-left" size={14} aria-hidden /><span className="proto-menu-item__label">Return to parent mode</span></button>
        <p className="pds-caption pds-kids-mode-menu__hint">Your parent needs to sign in.</p>
      </div>
    </ProtoPopoverShell>}
  </div>;
}
