/**
 * The empty state's way to My Home.
 *
 * Three absences matter as much as the one presence: each is a place where the button would
 * point somewhere you already are, or nowhere at all.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { libraryBrowseMyHomeAction } from '../library-browse-my-home-action';

function panel(overrides: Partial<Parameters<typeof libraryBrowseMyHomeAction>[0]> = {}) {
  return {
    shellIsSharedSpace: true,
    viewingHome: false,
    homeSpaceId: 'space_home',
    setListScope: vi.fn(),
    ...overrides,
  };
}

describe('Browse My Home, on an empty list', () => {
  it('offers My Home from the room side of a shared space, and flips the switch to it', () => {
    // A room with nothing shared into it yet is empty; your library is not. The empty state
    // is where that has to be said, because it is where the reader stops looking.
    const data = panel();
    render(<>{libraryBrowseMyHomeAction(data)}</>);
    screen.getByRole('button', { name: 'Browse My Home' }).click();
    expect(data.setListScope).toHaveBeenCalledWith('my-home');
  });

  it('is absent once the switch is on My Home — that emptiness is your own', () => {
    expect(libraryBrowseMyHomeAction(panel({ viewingHome: true }))).toBeNull();
  });

  it('is absent on the Home shell, where there is no room to leave', () => {
    expect(libraryBrowseMyHomeAction(panel({ shellIsSharedSpace: false }))).toBeNull();
  });

  it('is absent before there is a Home id to switch to', () => {
    expect(libraryBrowseMyHomeAction(panel({ homeSpaceId: null }))).toBeNull();
  });
});
