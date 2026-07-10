import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useProtoDialogFocus } from '../useProtoDialogFocus';

function PortaledDialog({
  open,
  label,
  onDismiss,
  empty = false,
  children,
}: {
  open: boolean;
  label: string;
  onDismiss: () => void;
  empty?: boolean;
  children?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useProtoDialogFocus({ open, dialogRef, onDismiss });
  if (!open) return null;
  return createPortal(
    <div ref={dialogRef} role="dialog" aria-label={label}>
      {empty ? null : (
        <>
          <h2 tabIndex={-1} data-proto-dialog-heading>
            {label}
          </h2>
          <button type="button">First</button>
          <button type="button">Last</button>
        </>
      )}
      {children}
    </div>,
    document.body,
  );
}

function BasicHarness({ onDismiss = vi.fn() }: { onDismiss?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <PortaledDialog
        open={open}
        label="Accessible dialog"
        onDismiss={() => {
          onDismiss();
          setOpen(false);
        }}
      />
    </>
  );
}

describe('useProtoDialogFocus', () => {
  it('focuses the heading, traps Tab in the portal, handles Escape, and restores the trigger', () => {
    const onDismiss = vi.fn();
    render(<BasicHarness onDismiss={onDismiss} />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    const heading = screen.getByRole('heading', { name: 'Accessible dialog' });
    expect(heading).toHaveFocus();

    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it('keeps focus on an empty dialog when Tab is pressed', () => {
    render(<PortaledDialog open label="Empty dialog" empty onDismiss={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Empty dialog' });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog).toHaveFocus();
  });

  it('gives a nested confirmation priority and restores each trigger in order', () => {
    function NestedHarness() {
      const [parentOpen, setParentOpen] = useState(false);
      const [confirmOpen, setConfirmOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setParentOpen(true)}>
            Open parent
          </button>
          <PortaledDialog open={parentOpen} label="Parent dialog" onDismiss={() => setParentOpen(false)}>
            <button type="button" onClick={() => setConfirmOpen(true)}>
              Open confirmation
            </button>
          </PortaledDialog>
          <PortaledDialog open={confirmOpen} label="Nested confirmation" onDismiss={() => setConfirmOpen(false)} />
        </>
      );
    }

    render(<NestedHarness />);
    const outerTrigger = screen.getByRole('button', { name: 'Open parent' });
    outerTrigger.focus();
    fireEvent.click(outerTrigger);
    const nestedTrigger = screen.getByRole('button', { name: 'Open confirmation' });
    nestedTrigger.focus();
    fireEvent.click(nestedTrigger);
    expect(screen.getByRole('heading', { name: 'Nested confirmation' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Nested confirmation' })).not.toBeInTheDocument();
    expect(nestedTrigger).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Parent dialog' })).not.toBeInTheDocument();
    expect(outerTrigger).toHaveFocus();
  });
});
