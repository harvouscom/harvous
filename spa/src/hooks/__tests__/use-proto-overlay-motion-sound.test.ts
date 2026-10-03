import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const playSound = vi.fn();
vi.mock('@/utils/sounds', () => ({ playSound }));

const { useProtoOverlayMotion } = await import('../useProtoOverlayMotion');

beforeEach(() => {
  playSound.mockClear();
});

describe('the sound of a sheet', () => {
  it('is silent for a sheet that mounts already open — nobody opened it just now', () => {
    renderHook(({ open }) => useProtoOverlayMotion(open), { initialProps: { open: true } });
    expect(playSound).not.toHaveBeenCalled();
  });

  it('breathes in on opening and falls shut on closing, once each', () => {
    const { rerender } = renderHook(({ open }) => useProtoOverlayMotion(open), {
      initialProps: { open: false },
    });
    rerender({ open: true });
    rerender({ open: true });
    rerender({ open: false });
    expect(playSound.mock.calls).toEqual([['nav.open'], ['nav.close']]);
  });
});
