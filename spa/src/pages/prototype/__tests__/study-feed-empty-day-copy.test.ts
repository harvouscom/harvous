/**
 * What an empty day says.
 *
 * Two rules from BRAND_VOICE.md that a later edit could quietly undo, so they are asserted
 * rather than trusted to a comment: an empty day never opens on a negation, and today is
 * never told that nothing happened. Today is still open — the sentence has to leave room
 * for the next thing, where a past day is settled and only wants to be called quiet.
 */
import { describe, expect, it } from 'vitest';
import { studyFeedEmptyDayCopy } from '../study-feed-presentation';

const NEGATIVE_OPENERS = ['nothing', 'no ', "don't", 'never', "can't", 'failed'];

describe('an empty day today', () => {
  it('says the day is still open rather than that it was empty', () => {
    const copy = studyFeedEmptyDayCopy(true);
    expect(copy.toLowerCase()).toContain('still open');
  });

  it('tells you where the next thing will land', () => {
    expect(studyFeedEmptyDayCopy(true).toLowerCase()).toContain('shows up here');
  });
});

describe('an empty day in the past', () => {
  it('calls it quiet rather than reporting an absence', () => {
    expect(studyFeedEmptyDayCopy(false).toLowerCase()).toContain('quiet');
  });

  it('does not tell a settled day it is still open', () => {
    expect(studyFeedEmptyDayCopy(false).toLowerCase()).not.toContain('still open');
  });
});

describe('the voice rules, for both', () => {
  it('never opens on a negation', () => {
    for (const isToday of [true, false]) {
      const first = studyFeedEmptyDayCopy(isToday).toLowerCase();
      for (const opener of NEGATIVE_OPENERS) {
        expect(first.startsWith(opener)).toBe(false);
      }
    }
  });

  it('never says "recorded", which is a log file talking about a person', () => {
    for (const isToday of [true, false]) {
      expect(studyFeedEmptyDayCopy(isToday).toLowerCase()).not.toContain('recorded');
    }
  });

  it('uses no em dashes, per the prototype copy convention', () => {
    for (const isToday of [true, false]) {
      expect(studyFeedEmptyDayCopy(isToday)).not.toContain('—');
    }
  });
});
