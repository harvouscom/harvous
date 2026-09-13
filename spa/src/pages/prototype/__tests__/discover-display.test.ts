/**
 * Discover draws topics and resources the way harvous.com does.
 *
 * The site cannot be imported from here, so these pin the half that can drift silently: a topic
 * added to the shared list with no glyph on this side, which would otherwise draw the fallback
 * stack while the site draws its use-case icon.
 */
import { describe, expect, it } from 'vitest';
import { DISCOVER_CATEGORIES } from '@/data/discover-categories';
import {
  DISCOVER_RESOURCE_TYPE_ICON,
  DISCOVER_RESOURCE_TYPE_NOUN,
  DISCOVER_TOPIC_ICON,
  discoverTopicIcon,
} from '../discover-display';

describe('topic glyphs', () => {
  it('gives every topic in the shared list a glyph of its own', () => {
    for (const category of DISCOVER_CATEGORIES) {
      expect(DISCOVER_TOPIC_ICON[category.id], `no glyph for ${category.id}`).toBeTruthy();
    }
  });

  it('falls back the way the site does for an id it does not know', () => {
    expect(discoverTopicIcon('not-a-topic')).toBe('layer-group');
  });
});

describe('resource types', () => {
  it('names each type the way the site labels it', () => {
    // "Tool" and "Guide", not "Resource": the type is what tells a lexicon from a how-to.
    expect(DISCOVER_RESOURCE_TYPE_NOUN.tool).toBe('Tool');
    expect(DISCOVER_RESOURCE_TYPE_NOUN.guide).toBe('Guide');
    expect(Object.keys(DISCOVER_RESOURCE_TYPE_NOUN).sort()).toEqual(
      ['article', 'book', 'guide', 'series', 'tool', 'video'],
    );
  });

  it('leaves the pages you read on the newspaper, as the site does', () => {
    expect(DISCOVER_RESOURCE_TYPE_ICON.article).toBeUndefined();
    expect(DISCOVER_RESOURCE_TYPE_ICON.guide).toBeUndefined();
    expect(DISCOVER_RESOURCE_TYPE_ICON.video).toBe('play');
  });
});
