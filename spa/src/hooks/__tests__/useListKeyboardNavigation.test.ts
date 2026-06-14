/**
 * Tests for prototype sidebar list row focus movement (Shift+↑/↓).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moveListRowFocus } from '../useListKeyboardNavigation';

let container: HTMLDivElement;
let rows: HTMLButtonElement[];

function buildList(count: number): void {
  container = document.createElement('div');
  container.className = 'proto-sidebar-scroll';
  const ul = document.createElement('ul');
  ul.className = 'proto-note-list';
  rows = [];
  for (let i = 0; i < count; i++) {
    const li = document.createElement('li');
    li.className = 'proto-note-row-item';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'proto-note-row__main';
    btn.textContent = `Note ${i}`;
    li.appendChild(btn);
    ul.appendChild(li);
    rows.push(btn);
  }
  container.appendChild(ul);
  document.body.appendChild(container);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  buildList(3);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('moveListRowFocus', () => {
  it('moves focus down and up between rows', () => {
    rows[0].focus();
    expect(moveListRowFocus(container, 1)).toBe(true);
    expect(document.activeElement).toBe(rows[1]);

    expect(moveListRowFocus(container, 1)).toBe(true);
    expect(document.activeElement).toBe(rows[2]);

    expect(moveListRowFocus(container, -1)).toBe(true);
    expect(document.activeElement).toBe(rows[1]);
  });

  it('focuses first row on step down when no row is focused', () => {
    document.body.focus();
    expect(moveListRowFocus(container, 1)).toBe(true);
    expect(document.activeElement).toBe(rows[0]);
  });

  it('focuses last row on step up when no row is focused', () => {
    document.body.focus();
    expect(moveListRowFocus(container, -1)).toBe(true);
    expect(document.activeElement).toBe(rows[2]);
  });

  it('jumps to first and last with jump option', () => {
    rows[1].focus();
    expect(moveListRowFocus(container, 0, { jump: 'end' })).toBe(true);
    expect(document.activeElement).toBe(rows[2]);

    expect(moveListRowFocus(container, 0, { jump: 'home' })).toBe(true);
    expect(document.activeElement).toBe(rows[0]);
  });

  it('does not wrap past the ends by default', () => {
    rows[2].focus();
    expect(moveListRowFocus(container, 1)).toBe(true);
    expect(document.activeElement).toBe(rows[2]);

    rows[0].focus();
    expect(moveListRowFocus(container, -1)).toBe(true);
    expect(document.activeElement).toBe(rows[0]);
  });

  it('wraps when enabled', () => {
    rows[2].focus();
    expect(moveListRowFocus(container, 1, { wrap: true })).toBe(true);
    expect(document.activeElement).toBe(rows[0]);

    expect(moveListRowFocus(container, -1, { wrap: true })).toBe(true);
    expect(document.activeElement).toBe(rows[2]);
  });

  it('returns false when container has no rows', () => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    expect(moveListRowFocus(container, 1)).toBe(false);
  });

  it('supports a custom rowSelector', () => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    const links: HTMLAnchorElement[] = [];
    for (let i = 0; i < 3; i++) {
      const a = document.createElement('a');
      a.className = 'proto-search-result-link';
      a.href = `#note-${i}`;
      container.appendChild(a);
      links.push(a);
    }
    document.body.appendChild(container);

    links[0].focus();
    expect(moveListRowFocus(container, 1, { rowSelector: 'a.proto-search-result-link' })).toBe(true);
    expect(document.activeElement).toBe(links[1]);
  });

  it('also drives folder rows (button.proto-note-row)', () => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    const ul = document.createElement('ul');
    ul.className = 'proto-note-list';
    const folderRows: HTMLButtonElement[] = [];
    for (let i = 0; i < 2; i++) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'proto-note-row';
      li.appendChild(btn);
      ul.appendChild(li);
      folderRows.push(btn);
    }
    container.appendChild(ul);
    document.body.appendChild(container);

    folderRows[0].focus();
    expect(moveListRowFocus(container, 1)).toBe(true);
    expect(document.activeElement).toBe(folderRows[1]);
  });

  it('marks keyboard focus on first and last rows', () => {
    document.body.focus();
    expect(moveListRowFocus(container, 1)).toBe(true);
    expect(rows[0].closest('.proto-note-row-item')?.getAttribute('data-keyboard-focus')).toBe('true');

    expect(moveListRowFocus(container, 0, { jump: 'end' })).toBe(true);
    expect(document.activeElement).toBe(rows[2]);
    expect(rows[2].closest('.proto-note-row-item')?.getAttribute('data-keyboard-focus')).toBe('true');
    expect(rows[0].closest('.proto-note-row-item')?.hasAttribute('data-keyboard-focus')).toBe(false);
  });

  it('walks collection cards in DOM order (left-to-right, top-to-bottom grid)', () => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.className = 'proto-sidebar-scroll';
    const ul = document.createElement('ul');
    ul.className = 'proto-collection-grid';
    const cards: HTMLButtonElement[] = [];
    for (let i = 0; i < 4; i++) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'proto-collection-card';
      btn.textContent = `Card ${i}`;
      li.appendChild(btn);
      ul.appendChild(li);
      cards.push(btn);
    }
    container.appendChild(ul);
    document.body.appendChild(container);

    document.body.focus();
    expect(moveListRowFocus(container, 1)).toBe(true);
    expect(document.activeElement).toBe(cards[0]);

    expect(moveListRowFocus(container, 1)).toBe(true);
    expect(document.activeElement).toBe(cards[1]);

    expect(moveListRowFocus(container, 1)).toBe(true);
    expect(document.activeElement).toBe(cards[2]);

    expect(moveListRowFocus(container, -1)).toBe(true);
    expect(document.activeElement).toBe(cards[1]);
    expect(cards[1].closest('li')?.getAttribute('data-keyboard-focus')).toBe('true');
  });
});
