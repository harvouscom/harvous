import { describe, expect, it } from 'vitest';
import {
  dedupeBroadcastRecipientIds,
  dedupeBroadcastSpaceIds,
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
