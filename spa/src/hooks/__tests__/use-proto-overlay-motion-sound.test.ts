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

  it('plays the panel voice on opening and on closing, once each', () => {
    const { rerender } = renderHook(({ open }) => useProtoOverlayMotion(open), {
      initialProps: { open: false },
    });
    rerender({ open: true });
    rerender({ open: true });
    rerender({ open: false });
    expect(playSound.mock.calls).toEqual([['panel.open'], ['panel.close']]);
  });
});
