/**
 * Put in order: pieces go into numbered places, and back out again.
 */
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { OrderSlots, OrderTray } from '../OrderPieces';

const PHRASES = ['that he gave', 'For God so loved', 'the world,'];

function Harness({ partState = () => undefined }: { partState?: (p: number) => 'right' | 'wrong' | undefined }) {
  const [placed, setPlaced] = useState<number[]>([]);
  return (
    <>
      <OrderSlots
        phrases={PHRASES}
        placed={placed}
        partState={partState}
        disabled={false}
        onRemove={(position) => setPlaced((c) => c.filter((_, i) => i !== position))}
      />
      <OrderTray phrases={PHRASES} placed={placed} disabled={false} onPlace={(i) => setPlaced((c) => [...c, i])} />
    </>
  );
}

const tray = () => within(screen.getByRole('group', { name: 'Pieces to place' }));

describe('putting a verse in order', () => {
  it('places pieces in the order they are tapped, leaving outlines in the tray', () => {
    render(<Harness />);
    fireEvent.click(tray().getByRole('button', { name: 'For God so loved' }));
    fireEvent.click(tray().getByRole('button', { name: 'the world,' }));
    expect(screen.getByRole('button', { name: '1: For God so loved, tap to take it back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2: the world,, tap to take it back' })).toBeTruthy();
    expect(tray().getAllByRole('button')).toHaveLength(1);
  });

  it('takes a placed piece back, and the ones after it move up', () => {
    render(<Harness />);
    fireEvent.click(tray().getByRole('button', { name: 'For God so loved' }));
    fireEvent.click(tray().getByRole('button', { name: 'the world,' }));
    fireEvent.click(screen.getByRole('button', { name: '1: For God so loved, tap to take it back' }));
    expect(screen.getByRole('button', { name: '1: the world,, tap to take it back' })).toBeTruthy();
    expect(tray().getByRole('button', { name: 'For God so loved' })).toBeTruthy();
  });

  it('empties the tray once every piece is placed', () => {
    render(<Harness />);
    for (const phrase of ['For God so loved', 'the world,', 'that he gave']) {
      fireEvent.click(tray().getByRole('button', { name: phrase }));
    }
    expect(screen.queryByRole('group', { name: 'Pieces to place' })).toBeNull();
  });
});
