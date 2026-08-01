import { describe, expect, it } from 'vitest';
import {
  buildCoEditRealtimeNotePatch,
  dedupeBroadcastRecipientIds,
  dedupeBroadcastSpaceIds,
  REALTIME_NOTE_PATCH_MAX_BYTES,
} from '../broadcast-shared-space-note';

describe('canonical shared-note broadcast fanout', () => {
  it('enumerates each active association target once', () => {
    expect(
      dedupeBroadcastSpaceIds([
        { spaceId: 'space_a' },
        { spaceId: 'space_b' },
        { spaceId: 'space_a' },
        { spaceId: null },
      ]),
    ).toEqual(['space_a', 'space_b']);
  });

  it('deduplicates recipients across spaces and excludes the actor', () => {
    expect(
      dedupeBroadcastRecipientIds(
        [
          ['user_actor', 'user_a', 'user_b'],
          ['user_b', 'user_c', 'user_actor'],
        ],
        'user_actor',
      ),
    ).toEqual(['user_a', 'user_b', 'user_c']);
  });
});

describe('buildCoEditRealtimeNotePatch', () => {
  it('returns null when co-editing is off', () => {
    expect(
      buildCoEditRealtimeNotePatch({
        coEditEnabled: false,
        contentEncrypted: false,
        title: 'T',
        content: '<p>hi</p>',
        updatedAt: new Date('2026-07-31T00:00:00.000Z'),
      }),
    ).toBeNull();
  });

  it('returns null for encrypted notes even when co-editing is on', () => {
    expect(
      buildCoEditRealtimeNotePatch({
        coEditEnabled: true,
        contentEncrypted: true,
        title: 'T',
        content: 'ciphertext',
        updatedAt: new Date('2026-07-31T00:00:00.000Z'),
      }),
    ).toBeNull();
  });

  it('builds a patch with spaceId null', () => {
    expect(
      buildCoEditRealtimeNotePatch({
        coEditEnabled: true,
        contentEncrypted: false,
        title: 'John 3',
        content: '<p>For God so loved</p>',
        updatedAt: new Date('2026-07-31T12:00:00.000Z'),
      }),
    ).toEqual({
      title: 'John 3',
      content: '<p>For God so loved</p>',
      updatedAt: '2026-07-31T12:00:00.000Z',
      spaceId: null,
    });
  });

  it('returns null when the serialized patch exceeds the broadcast cap', () => {
    const huge = 'x'.repeat(REALTIME_NOTE_PATCH_MAX_BYTES);
    expect(
      buildCoEditRealtimeNotePatch({
        coEditEnabled: true,
        contentEncrypted: false,
        title: 'T',
        content: huge,
        updatedAt: new Date('2026-07-31T00:00:00.000Z'),
      }),
    ).toBeNull();
  });
});
