/**
 * Which lines the Activity compose prompt offers, and in what order.
 *
 * The order matters as much as the set: the first line is the one the prompt rests on after its
 * pass, so it must be the most specific thing that is true right now.
 */
import { describe, expect, it } from 'vitest';
import {
  FEED_COMPOSE_FILLERS,
  FEED_COMPOSE_MAX_CHARS,
  FEED_COMPOSE_MAX_LINES,
  buildFeedComposePrompts,
  type FeedComposeContext,
} from '../feed-compose-prompts';

// Sept 2026: the 13th is a Sunday, the 14th Monday, the 16th Wednesday, the 19th Saturday.
const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 0);
const base = (over: Partial<FeedComposeContext> = {}): FeedComposeContext => ({
  now: at(16, 14),
  noteCount: 12,
  ...over,
});

describe('the day of the week', () => {
  it('asks what Sunday left you with on Monday and Tuesday, first', () => {
    expect(buildFeedComposePrompts(base({ now: at(14, 14) }))[0]).toBe('What did Sunday leave you with?');
    expect(buildFeedComposePrompts(base({ now: at(15, 14) }))[0]).toBe('What did Sunday leave you with?');
  });

  it('does not ask it on any other day', () => {
    for (const day of [13, 16, 17, 18, 19]) {
      expect(buildFeedComposePrompts(base({ now: at(day, 14) }))).not.toContain(
        'What did Sunday leave you with?',
      );
    }
  });

  it('on Sunday, is about the sermon in the morning and a reflection later', () => {
    expect(buildFeedComposePrompts(base({ now: at(13, 10) }))[0]).toBe('Notes from this morning’s sermon?');
    expect(buildFeedComposePrompts(base({ now: at(13, 17) }))[0]).toBe('What stayed with you from church?');
  });

  it('looks ahead to Sunday on Saturday', () => {
    expect(buildFeedComposePrompts(base({ now: at(19, 14) }))[0]).toBe('Preparing your heart for Sunday?');
  });
});

describe('your own study', () => {
  it('names the chapter you are in', () => {
    const lines = buildFeedComposePrompts(base({ continueReading: { book: 'Romans', chapter: 8 } }));
    expect(lines).toContain('Still in Romans 8?');
  });

  it('names what you keep returning to, shortening the line when the name is long', () => {
    expect(buildFeedComposePrompts(base({ trendLabel: 'grace' }))).toContain('Still thinking about grace?');
    expect(buildFeedComposePrompts(base({ trendLabel: 'the Sermon on the Mount' }))).toContain(
      'More on the Sermon on the Mount?',
    );
  });

  it('offers the Thread you are building', () => {
    expect(buildFeedComposePrompts(base({ leadThreadTitle: 'Prayer' }))).toContain('Adding to Prayer?');
  });

  it('asks about today’s passage only until it has been acted on', () => {
    const open = buildFeedComposePrompts(base({ passage: { reference: 'Psalm 18:1-2', acted: false } }));
    const done = buildFeedComposePrompts(base({ passage: { reference: 'Psalm 18:1-2', acted: true } }));
    expect(open).toContain('Thoughts on Psalm 18:1-2?');
    expect(done).not.toContain('Thoughts on Psalm 18:1-2?');
  });

  it('does not ask about today’s passage twice when it is in the chapter you are reading', () => {
    const lines = buildFeedComposePrompts(
      base({
        continueReading: { book: 'Psalms', chapter: 18 },
        passage: { reference: 'Psalms 18:1-2', acted: false },
      }),
    );
    expect(lines).toContain('Still in Psalms 18?');
    expect(lines).not.toContain('Thoughts on Psalms 18:1-2?');
    const elsewhere = buildFeedComposePrompts(
      base({
        continueReading: { book: 'Psalms', chapter: 1 },
        passage: { reference: 'Psalms 18:1-2', acted: false },
      }),
    );
    expect(elsewhere).toContain('Thoughts on Psalms 18:1-2?');
  });

  it('greets someone who has never written with the plainest line of all', () => {
    expect(buildFeedComposePrompts(base({ noteCount: 0 }))[0]).toBe('Write your first note');
  });
});

describe('the hour', () => {
  it('has a morning line, an evening line and a late one, and leaves the afternoon alone', () => {
    expect(buildFeedComposePrompts(base({ now: at(16, 8) }))).toContain('What’s on your mind this morning?');
    expect(buildFeedComposePrompts(base({ now: at(16, 19) }))).toContain('What stayed with you today?');
    expect(buildFeedComposePrompts(base({ now: at(16, 23) }))).toContain('A thought before you rest?');
    const afternoon = buildFeedComposePrompts(base({ now: at(16, 14) }));
    expect(afternoon).toEqual([...FEED_COMPOSE_FILLERS]);
  });
});

describe('the list as a whole', () => {
  const busy = base({
    now: at(14, 8),
    noteCount: 0,
    continueReading: { book: 'Romans', chapter: 8 },
    trendLabel: 'grace',
    leadThreadTitle: 'Prayer',
    passage: { reference: 'Psalm 18:1-2', acted: false },
  });

  it('keeps the most specific lines, in priority order, and caps the pass', () => {
    expect(buildFeedComposePrompts(busy)).toEqual([
      'Write your first note',
      'What did Sunday leave you with?',
      'Still in Romans 8?',
      'Still thinking about grace?',
      'Adding to Prayer?',
    ]);
  });

  it('never offers a line that would clip on a phone', () => {
    const lines = buildFeedComposePrompts(
      base({
        continueReading: { book: 'Song of Solomon', chapter: 8 },
        leadThreadTitle: 'A very long Thread title that goes on',
        passage: { reference: '1 Corinthians 13:4-7, 13', acted: false },
      }),
    );
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(FEED_COMPOSE_MAX_CHARS);
    expect(lines.length).toBeLessThanOrEqual(FEED_COMPOSE_MAX_LINES);
  });

  it('always has at least the plain invitations to rotate through', () => {
    expect(buildFeedComposePrompts(base()).length).toBeGreaterThanOrEqual(FEED_COMPOSE_FILLERS.length);
  });
});
