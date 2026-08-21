import { describe, expect, it, beforeEach } from 'vitest';
import {
  markRecallShelfSeen,
  recallShelfHasUnseen,
  recallShelfSeenDay,
} from '../proto-recall-seen';

const SPACE = 'space_home';
const TODAY = 20_320;

describe('has the Suggested shelf been looked at today', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('says nothing before the shelf has ever had anything on it', () => {
    // A dot leading to an empty panel is how people learn to ignore dots. A brand-new
    // account has no suggestions assembled yet and should not be sent looking.
    expect(recallShelfHasUnseen(SPACE, TODAY)).toBe(false);
  });

  it('is quiet for the rest of the day once the shelf has been seen', () => {
    markRecallShelfSeen(SPACE, TODAY);
    expect(recallShelfHasUnseen(SPACE, TODAY)).toBe(false);
  });

  it('marks the way back once the day turns over', () => {
    // The deck is rotated by day index and cooldowns expire on day boundaries, so tomorrow
    // is genuinely a different shelf rather than the same one re-offered.
    markRecallShelfSeen(SPACE, TODAY);
    expect(recallShelfHasUnseen(SPACE, TODAY + 1)).toBe(true);
  });

  it('keeps its answer per space', () => {
    markRecallShelfSeen(SPACE, TODAY);
    expect(recallShelfHasUnseen('space_other', TODAY)).toBe(false);
    expect(recallShelfSeenDay('space_other')).toBeNull();
  });

  it('ignores a missing space rather than writing under a bare key', () => {
    markRecallShelfSeen(null, TODAY);
    markRecallShelfSeen(undefined, TODAY);
    expect(recallShelfSeenDay(null)).toBeNull();
    expect(recallShelfHasUnseen(null, TODAY)).toBe(false);
  });

  it('survives junk in storage', () => {
    localStorage.setItem('harvous.prototype.recallShelfSeen.space_home', 'not-a-day');
    expect(recallShelfSeenDay(SPACE)).toBeNull();
    expect(recallShelfHasUnseen(SPACE, TODAY)).toBe(false);
  });

  it('moves forward when seen again on a later day', () => {
    markRecallShelfSeen(SPACE, TODAY);
    markRecallShelfSeen(SPACE, TODAY + 3);
    expect(recallShelfSeenDay(SPACE)).toBe(TODAY + 3);
    expect(recallShelfHasUnseen(SPACE, TODAY + 3)).toBe(false);
  });
});
