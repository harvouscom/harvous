import { describe, it, expect } from 'vitest';
import {
  THREAD_REFLECT_PROMPTS,
  dayIndex,
  threadReflectPrompt,
} from '@/utils/thread-reflect-prompts';

describe('threadReflectPrompt', () => {
  it('asks the same Thread the same thing all day', () => {
    const day = dayIndex(new Date('2026-09-03T09:00:00'));
    expect(threadReflectPrompt('t1', 'Covenant', day)).toBe(
      threadReflectPrompt('t1', 'Covenant', day),
    );
  });

  it('turns over between days', () => {
    const asked = [0, 1, 2, 3, 4, 5, 6, 7].map((o) =>
      threadReflectPrompt('t1', 'Covenant', 20000 + o),
    );
    expect(new Set(asked).size).toBeGreaterThan(1);
  });

  it('names the Thread, and capitalises it', () => {
    for (const prompt of THREAD_REFLECT_PROMPTS) {
      const text = prompt('Covenant');
      expect(text).toContain('Covenant');
      expect(text).toContain('Thread');
      // `check:thread-terminology` enforces the capital; this catches it before that does.
      expect(text).not.toMatch(/\bthread\b/);
    }
  });

  it('never needs a second note name, which Home does not have', () => {
    /*
     * Three of these came from the connection prompts, which read "Why did you connect X and
     * Y?" — Home holds a Thread, not a pair, so they are rewritten about the notes in it.
     */
    for (const prompt of THREAD_REFLECT_PROMPTS) {
      const text = prompt('Covenant');
      expect(text).not.toContain('the other');
      expect(text).not.toMatch(/\band\s+\?/);
    }
  });

  it('is a question, because none of these has an answer to mark', () => {
    for (const prompt of THREAD_REFLECT_PROMPTS) {
      expect(prompt('Covenant').endsWith('?')).toBe(true);
    }
  });
});
