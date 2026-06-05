/**
 * Tests for roving keyboard navigation across sidebar list rows.
 *
 * Builds the real row markup (button.proto-note-row__main inside the scroll container),
 * mounts the hook, and drives Arrow / j-k / Home-End to assert focus moves correctly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useListKeyboardNavigation } from '../useListKeyboardNavigation';

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

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  // jsdom has no layout engine; scrollIntoView is called by the hook.
  Element.prototype.scrollIntoView = vi.fn();
  buildList(3);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function mount() {
  return renderHook(() => useListKeyboardNavigation({ current: container }));
}

describe('useListKeyboardNavigation', () => {
  it('ArrowDown / ArrowUp move focus between rows', () => {
    mount();
    rows[0].focus();

    const down = press(rows[0], 'ArrowDown');
    expect(document.activeElement).toBe(rows[1]);
    expect(down.defaultPrevented).toBe(true);

    press(rows[1], 'ArrowDown');
    expect(document.activeElement).toBe(rows[2]);

    press(rows[2], 'ArrowUp');
    expect(document.activeElement).toBe(rows[1]);
  });

  it('supports vim j/k aliases', () => {
    mount();
    rows[0].focus();

    press(rows[0], 'j');
    expect(document.activeElement).toBe(rows[1]);

    press(rows[1], 'k');
    expect(document.activeElement).toBe(rows[0]);
  });

  it('Home / End jump to first and last', () => {
    mount();
    rows[1].focus();

    press(rows[1], 'End');
    expect(document.activeElement).toBe(rows[2]);

    press(rows[2], 'Home');
    expect(document.activeElement).toBe(rows[0]);
  });

  it('does not wrap past the ends by default (and consumes the key)', () => {
    mount();
    rows[2].focus();
    const e = press(rows[2], 'ArrowDown');
    expect(document.activeElement).toBe(rows[2]);
    expect(e.defaultPrevented).toBe(true);

    rows[0].focus();
    press(rows[0], 'ArrowUp');
    expect(document.activeElement).toBe(rows[0]);
  });

  it('wraps when enabled', () => {
    renderHook(() => useListKeyboardNavigation({ current: container }, { wrap: true }));
    rows[2].focus();
    press(rows[2], 'ArrowDown');
    expect(document.activeElement).toBe(rows[0]);

    press(rows[0], 'ArrowUp');
    expect(document.activeElement).toBe(rows[2]);
  });

  it('ignores keys when focus is not on a row (j/k stay free for typing)', () => {
    mount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const e = press(input, 'j');
    expect(document.activeElement).toBe(input);
    expect(e.defaultPrevented).toBe(false);
  });

  it('ignores chords with modifiers', () => {
    mount();
    rows[0].focus();
    const e = press(rows[0], 'ArrowDown', { metaKey: true });
    expect(document.activeElement).toBe(rows[0]);
    expect(e.defaultPrevented).toBe(false);
  });

  it('drives anchor rows via a custom rowSelector (search results)', () => {
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

    renderHook(() =>
      useListKeyboardNavigation({ current: container }, { rowSelector: 'a.proto-search-result-link' }),
    );
    links[0].focus();
    press(links[0], 'ArrowDown');
    expect(document.activeElement).toBe(links[1]);
    press(links[1], 'k');
    expect(document.activeElement).toBe(links[0]);
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

    renderHook(() => useListKeyboardNavigation({ current: container }));
    folderRows[0].focus();
    press(folderRows[0], 'ArrowDown');
    expect(document.activeElement).toBe(folderRows[1]);
  });
});
