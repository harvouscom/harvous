/**
 * Taking a sticker off in the Bible reader.
 *
 * Removing one used to be an unlabelled X in the sheet's header, and tapping the sticker already
 * on re-stuck it. These pin the three ways off: tap the chosen sticker, the named Remove sticker
 * button under the grids, and the margin sticker itself, which opens the sheet for its verse.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReaderStickerMargin, ReaderStickerSheet } from '../ReaderVerseStickers';

function sheet(current: Parameters<typeof ReaderStickerSheet>[0]['current']) {
  const onPick = vi.fn();
  render(<ReaderStickerSheet reference="John 3:16" current={current} onBack={() => {}} onPick={onPick} />);
  return onPick;
}

describe('ReaderStickerSheet', () => {
  it('sticks on a sticker that is not chosen', () => {
    const onPick = sheet(null);
    fireEvent.click(screen.getByRole('button', { name: 'Heart sticker' }));
    expect(onPick).toHaveBeenCalledWith('heart');
  });

  it('takes the chosen sticker off when it is tapped again, rather than re-sticking it', () => {
    const onPick = sheet('heart');
    const chosen = screen.getByRole('button', { name: 'Heart sticker' });
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chosen);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('swaps to another sticker when one is already on', () => {
    const onPick = sheet('heart');
    fireEvent.click(screen.getByRole('button', { name: 'Star sticker' }));
    expect(onPick).toHaveBeenCalledWith('star');
  });

  it('shows a named Remove sticker button only when the verse has one', () => {
    sheet(null);
    expect(screen.queryByText('Remove sticker')).toBeNull();
  });

  it('removes the sticker from the Remove sticker button', () => {
    const onPick = sheet('heart');
    const remove = screen.getByRole('button', { name: 'Remove the heart sticker from John 3:16' });
    expect(remove.textContent).toContain('Remove sticker');
    fireEvent.click(remove);
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('focuses the chosen sticker when opened from the margin', () => {
    render(
      <ReaderStickerSheet reference="John 3:16" current="star" onBack={() => {}} onPick={() => {}} autoFocus />,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Star sticker' }));
  });
});

describe('ReaderStickerMargin', () => {
  const placed = [{ verse: 16, sticker: 'heart' as const, top: 40 }];

  it('makes each sticker a button that opens the sheet for its own verse', () => {
    const onOpen = vi.fn();
    render(<ReaderStickerMargin placed={placed} chapter={3} fresh={null} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sticker on verse 16: heart. Change or remove' }));
    expect(onOpen).toHaveBeenCalledWith(16);
  });

  it('stays a hidden mark where there is no account to change it in', () => {
    const { container } = render(<ReaderStickerMargin placed={placed} chapter={3} fresh={null} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.pds-reader__stickers')?.getAttribute('aria-hidden')).toBe('true');
  });
});
