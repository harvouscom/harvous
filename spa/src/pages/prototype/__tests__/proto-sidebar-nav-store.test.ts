import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PROTO_SIDEBAR_NAV_STORAGE_KEY,
  decodeFolderDrill,
  encodeFolderDrill,
  readPersistedSidebarNav,
  writePersistedSidebarNav,
} from '../proto-sidebar-nav-store';

describe('proto-sidebar-nav-store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to Home layer with no drill-downs', () => {
    expect(readPersistedSidebarNav()).toEqual({
      layer: 'space',
      folderDrill: undefined,
      threadDrillId: undefined,
      scriptureDrill: { level: 'books' },
    });
  });

  it('round-trips layer and folder drill encodings', () => {
    writePersistedSidebarNav({ layer: 'list', folderDrill: 'Romans Study' });
    expect(readPersistedSidebarNav()).toMatchObject({
      layer: 'list',
      folderDrill: 'Romans Study',
    });

    writePersistedSidebarNav({ folderDrill: null });
    expect(readPersistedSidebarNav().folderDrill).toBe(null);

    writePersistedSidebarNav({ folderDrill: undefined });
    expect(readPersistedSidebarNav().folderDrill).toBeUndefined();
  });

  it('encodeFolderDrill maps drill values to storage tokens', () => {
    expect(encodeFolderDrill(undefined)).toBe('top');
    expect(encodeFolderDrill(null)).toBe('unsorted');
    expect(encodeFolderDrill('Work')).toBe('Work');
  });

  it('decodeFolderDrill maps storage tokens to drill values', () => {
    expect(decodeFolderDrill('top')).toBeUndefined();
    expect(decodeFolderDrill(undefined)).toBeUndefined();
    expect(decodeFolderDrill('unsorted')).toBe(null);
    expect(decodeFolderDrill('Work')).toBe('Work');
    expect(decodeFolderDrill(42)).toBeUndefined();
  });

  it('round-trips thread drill id', () => {
    writePersistedSidebarNav({ threadDrillId: 'note_42' });
    expect(readPersistedSidebarNav().threadDrillId).toBe('note_42');

    writePersistedSidebarNav({ clearThreadDrill: true });
    expect(readPersistedSidebarNav().threadDrillId).toBeUndefined();
  });

  it('validates scripture drill shapes on read', () => {
    localStorage.setItem(
      PROTO_SIDEBAR_NAV_STORAGE_KEY,
      JSON.stringify({
        scriptureDrill: { level: 'passages', bookOrder: 45 },
      }),
    );
    expect(readPersistedSidebarNav().scriptureDrill).toEqual({ level: 'passages', bookOrder: 45 });

    localStorage.setItem(
      PROTO_SIDEBAR_NAV_STORAGE_KEY,
      JSON.stringify({
        scriptureDrill: { level: 'notes', bookOrder: 45, passageKey: 'ROM.8' },
      }),
    );
    expect(readPersistedSidebarNav().scriptureDrill).toEqual({
      level: 'notes',
      bookOrder: 45,
      passageKey: 'ROM.8',
    });
  });

  it('rejects malformed scripture drill values', () => {
    localStorage.setItem(
      PROTO_SIDEBAR_NAV_STORAGE_KEY,
      JSON.stringify({ scriptureDrill: { level: 'passages', bookOrder: 'bad' } }),
    );
    expect(readPersistedSidebarNav().scriptureDrill).toEqual({ level: 'books' });

    localStorage.setItem(
      PROTO_SIDEBAR_NAV_STORAGE_KEY,
      JSON.stringify({ scriptureDrill: { level: 'notes', bookOrder: 1 } }),
    );
    expect(readPersistedSidebarNav().scriptureDrill).toEqual({ level: 'books' });

    localStorage.setItem(PROTO_SIDEBAR_NAV_STORAGE_KEY, '{not json');
    expect(readPersistedSidebarNav().scriptureDrill).toEqual({ level: 'books' });
  });

  it('ignores invalid layer values', () => {
    localStorage.setItem(PROTO_SIDEBAR_NAV_STORAGE_KEY, JSON.stringify({ layer: 'dashboard' }));
    expect(readPersistedSidebarNav().layer).toBe('space');
  });
});
