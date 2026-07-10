import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  computeCenteredPortaledDialogPosition,
  computeMainColumnTopRightPopoverPosition,
  resolveMainColumnPopoverHost,
} from '../proto-anchored-popover-position';

describe('computeMainColumnTopRightPopoverPosition', () => {
  let host: HTMLDivElement;
  let card: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    host.className = 'proto-shell__main-inner';
    host.getBoundingClientRect = () =>
      ({
        top: 64,
        left: 320,
        right: 1200,
        bottom: 900,
        width: 880,
        height: 836,
        x: 320,
        y: 64,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(host);

    card = document.createElement('div');
    card.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 400,
        bottom: 520,
        width: 400,
        height: 520,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  });

  afterEach(() => {
    host.remove();
  });

  it('anchors to the main column top-right inset', () => {
    const inset = 8;
    const viewportMargin = 12;
    const hostRect = host.getBoundingClientRect();
    const cardWidth = card.getBoundingClientRect().width;
    const vw = window.innerWidth;
    expect(computeMainColumnTopRightPopoverPosition(card)).toEqual({
      top: hostRect.top + inset,
      left: Math.max(viewportMargin, Math.min(hostRect.right - cardWidth - inset, vw - cardWidth - viewportMargin)),
    });
  });

  it('resolves the right-panel host when present', () => {
    host.className = 'proto-shell__right-panel-host';
    expect(resolveMainColumnPopoverHost()).toBe(host);
  });
});

describe('computeCenteredPortaledDialogPosition', () => {
  it('centers horizontally and clamps top within the viewport', () => {
    const card = document.createElement('div');
    card.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 360,
        bottom: 480,
        width: 360,
        height: 480,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const viewportMargin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardWidth = 360;
    const cardHeight = 480;

    expect(computeCenteredPortaledDialogPosition(card)).toEqual({
      left: Math.max(viewportMargin, (vw - cardWidth) / 2),
      top: Math.max(viewportMargin, Math.min(vh - cardHeight - viewportMargin, vh * 0.12)),
    });
  });
});
