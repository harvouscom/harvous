import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  syncFormatToolbarPaperInset,
  syncFormatToolbarReservedHeight,
  syncStudyDockCenterOffset,
} from '../study-dock-layout';

function mockMatchMedia(desktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: desktop && query.includes('min-width: 900px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function mockRect(el: HTMLElement, rect: DOMRectInit) {
  el.getBoundingClientRect = () =>
    ({
      x: rect.x ?? rect.left ?? 0,
      y: rect.y ?? rect.top ?? 0,
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      top: rect.top ?? 0,
      left: rect.left ?? 0,
      right: (rect.left ?? 0) + (rect.width ?? 0),
      bottom: (rect.top ?? 0) + (rect.height ?? 0),
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('syncStudyDockCenterOffset', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockMatchMedia(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 0 and resets the CSS variable when sidebar is collapsed', () => {
    const shell = document.createElement('div');
    shell.className = 'proto-shell proto-shell--sidebar-collapsed';
    document.body.appendChild(shell);

    expect(syncStudyDockCenterOffset()).toBe(0);
    expect(shell.style.getPropertyValue('--proto-study-dock-center-offset')).toBe('0px');
  });

  it('returns 0 on mobile viewport', () => {
    mockMatchMedia(false);
    const shell = document.createElement('div');
    shell.className = 'proto-shell';
    document.body.appendChild(shell);

    expect(syncStudyDockCenterOffset()).toBe(0);
    expect(shell.style.getPropertyValue('--proto-study-dock-center-offset')).toBe('0px');
  });

  it('measures editor paper center vs track viewport center on desktop', () => {
    const shell = document.createElement('div');
    shell.className = 'proto-shell proto-shell--note-chrome';
    document.body.appendChild(shell);

    const paper = document.createElement('div');
    paper.className = 'proto-editor-paper';
    mockRect(paper, { left: 300, width: 720, height: 600 });
    document.body.appendChild(paper);

    const track = document.createElement('div');
    track.className = 'study-dock-carousel__track';
    mockRect(track, { left: 0, width: 1200, height: 48 });
    document.body.appendChild(track);

    // Paper center = 660; track center = 600 → offset 60
    expect(syncStudyDockCenterOffset(track)).toBe(60);
    expect(shell.style.getPropertyValue('--proto-study-dock-center-offset')).toBe('60px');
    expect(shell.style.getPropertyValue('--proto-study-dock-paper-width-measured')).toBe('720px');
  });

  it('refines offset for a single dock using the card face and item translate undo', () => {
    const shell = document.createElement('div');
    shell.className = 'proto-shell proto-shell--note-chrome';
    document.body.appendChild(shell);

    const paper = document.createElement('div');
    paper.className = 'proto-editor-paper';
    mockRect(paper, { left: 400, width: 720, height: 600 });
    document.body.appendChild(paper);

    const track = document.createElement('div');
    track.className = 'study-dock-carousel__track';
    mockRect(track, { left: 0, width: 1200, height: 48 });

    const item = document.createElement('div');
    item.className = 'study-dock-carousel__item';
    const inner = document.createElement('div');
    inner.className = 'study-dock-carousel__item-inner';
    const outer = document.createElement('div');
    outer.className = 'study-dock-card__outer';
    const card = document.createElement('div');
    card.className = 'study-dock-card__card';
    mockRect(card, { left: 572, width: 720, height: 200 });
    outer.appendChild(card);
    inner.appendChild(outer);
    item.appendChild(inner);
    track.appendChild(item);
    document.body.appendChild(track);

    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === item) {
        return { transform: 'matrix(1, 0, 0, 1, 50, 0)' } as CSSStyleDeclaration;
      }
      return { transform: 'none' } as CSSStyleDeclaration;
    });

    // Paper center = 760; natural card center = 932 - 50 = 882 → offset = -122
    expect(syncStudyDockCenterOffset(track)).toBe(-122);

    getComputedStyleSpy.mockRestore();
  });
});

describe('syncFormatToolbarPaperInset', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 0 and removes the CSS variables when paper or chrome row is missing', () => {
    const shell = document.createElement('div');
    shell.className = 'proto-shell';
    shell.style.setProperty('--proto-format-toolbar-paper-inset', '120px');
    shell.style.setProperty('--proto-format-toolbar-paper-right-inset', '80px');
    document.body.appendChild(shell);

    expect(syncFormatToolbarPaperInset()).toBe(0);
    expect(shell.style.getPropertyValue('--proto-format-toolbar-paper-inset')).toBe('');
    expect(shell.style.getPropertyValue('--proto-format-toolbar-paper-right-inset')).toBe('');
  });

  it('measures paper left and right edges relative to the chrome row', () => {
    const shell = document.createElement('div');
    shell.className = 'proto-shell proto-shell--note-chrome';
    document.body.appendChild(shell);

    const chromeRow = document.createElement('div');
    chromeRow.className = 'proto-shell__editor-chrome-row';
    mockRect(chromeRow, { left: 0, width: 1200, height: 44 });
    document.body.appendChild(chromeRow);

    const paper = document.createElement('div');
    paper.className = 'proto-editor-paper';
    mockRect(paper, { left: 340, width: 720, height: 600 });
    document.body.appendChild(paper);

    expect(syncFormatToolbarPaperInset()).toBe(340);
    expect(shell.style.getPropertyValue('--proto-format-toolbar-paper-inset')).toBe('340px');
    expect(shell.style.getPropertyValue('--proto-format-toolbar-paper-right-inset')).toBe('140px');
  });

  it('clamps to 0 when paper sits left of the chrome row', () => {
    const shell = document.createElement('div');
    shell.className = 'proto-shell proto-shell--note-chrome';
    document.body.appendChild(shell);

    const chromeRow = document.createElement('div');
    chromeRow.className = 'proto-shell__editor-chrome-row';
    mockRect(chromeRow, { left: 200, width: 1000, height: 44 });
    document.body.appendChild(chromeRow);

    const paper = document.createElement('div');
    paper.className = 'proto-editor-paper';
    mockRect(paper, { left: 100, width: 720, height: 600 });
    document.body.appendChild(paper);

    expect(syncFormatToolbarPaperInset()).toBe(0);
    expect(shell.style.getPropertyValue('--proto-format-toolbar-paper-inset')).toBe('0px');
    expect(shell.style.getPropertyValue('--proto-format-toolbar-paper-right-inset')).toBe('380px');
  });
});

describe('syncFormatToolbarReservedHeight', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--proto-format-toolbar-reserved-height');
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--proto-format-toolbar-reserved-height');
    vi.unstubAllGlobals();
  });

  it('returns 0 and removes the CSS variable when the format bar is missing', () => {
    document.documentElement.style.setProperty('--proto-format-toolbar-reserved-height', '52px');

    expect(syncFormatToolbarReservedHeight()).toBe(0);
    expect(document.documentElement.style.getPropertyValue('--proto-format-toolbar-reserved-height')).toBe(
      '',
    );
  });

  it('returns 0 and removes the CSS variable when the bar is not in format mode', () => {
    const formatBar = document.createElement('div');
    formatBar.className = 'proto-editor-bottom-bar';
    formatBar.dataset.mode = 'hidden';
    mockRect(formatBar, { height: 52 });
    document.body.appendChild(formatBar);

    expect(syncFormatToolbarReservedHeight()).toBe(0);
    expect(document.documentElement.style.getPropertyValue('--proto-format-toolbar-reserved-height')).toBe(
      '',
    );
  });

  it('measures the format bar height when in format mode', () => {
    const formatBar = document.createElement('div');
    formatBar.className = 'proto-editor-bottom-bar';
    formatBar.dataset.mode = 'format';
    mockRect(formatBar, { height: 48 });
    document.body.appendChild(formatBar);

    expect(syncFormatToolbarReservedHeight()).toBe(48);
    expect(document.documentElement.style.getPropertyValue('--proto-format-toolbar-reserved-height')).toBe(
      '48px',
    );
  });
});
