import { describe, expect, it } from 'vitest';
import { companionToolRow } from '../space-companion';

const room = (over: Partial<{ id: string; title: string; color: string | null }> = {}) => ({
  id: 'space_abc',
  title: 'Couples w/o kids',
  color: 'violet',
  ...over,
});

describe('companionToolRow', () => {
  it('is nothing when the room is unpaired', () => {
    expect(companionToolRow(null, true)).toBeNull();
    expect(companionToolRow(undefined, false)).toBeNull();
  });

  it('describes the room you would land in, not the one you are standing in', () => {
    // In a channel, the companion is the space it serves.
    const fromChannel = companionToolRow(room(), true);
    expect(fromChannel).toMatchObject({ icon: 'user-group', meta: 'Shared space' });

    // In that space, the companion is the channel.
    const fromSpace = companionToolRow(room({ title: 'Young Adults' }), false);
    expect(fromSpace).toMatchObject({ icon: 'rss', meta: 'Channel' });
  });

  it('titles the row with the other room, never a sentence about it', () => {
    // The row's own meta says what the relationship is, so the title is free to
    // be just the name — which is what makes it scannable in a list of tools.
    expect(companionToolRow(room(), true)?.title).toBe('Couples w/o kids');
  });

  it('prefixes a bare id and leaves a prefixed one alone', () => {
    expect(companionToolRow(room({ id: 'abc' }), true)?.spaceId).toBe('space_abc');
    expect(companionToolRow(room({ id: 'space_abc' }), true)?.spaceId).toBe('space_abc');
  });

  it('never carries the other room colour', () => {
    // A companion is a sibling, not a source: tinting by it would imply this
    // room's material came from there (CHURCH_STUDY_MATERIAL_LINKING.md).
    expect(companionToolRow(room(), true)).not.toHaveProperty('color');
  });
});
