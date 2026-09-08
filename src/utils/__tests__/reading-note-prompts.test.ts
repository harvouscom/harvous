import { describe, it, expect } from 'vitest';
import {
  READING_NOTE_PROMPTS,
  readingNoteEyebrow,
  readingNotePrompt,
} from '@/utils/reading-note-prompts';
import { dayIndex } from '@/utils/note-mark-prompts';

describe('readingNotePrompt', () => {
  it('asks the same chapter the same thing all day, so a reload is not a new card', () => {
    const day = dayIndex(new Date('2026-09-04T09:00:00'));
    expect(readingNotePrompt('John', 3, day)).toBe(readingNotePrompt('John', 3, day));
    expect(READING_NOTE_PROMPTS).toContain(readingNotePrompt('John', 3, day));
  });

  it('rotates across days and differs between chapters', () => {
    const days = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => readingNotePrompt('John', 3, d));
    expect(new Set(days).size).toBeGreaterThan(1);
    const chapters = [1, 2, 3, 4, 5, 6].map((c) => readingNotePrompt('John', c, 500));
    expect(new Set(chapters).size).toBeGreaterThan(1);
  });

  it('never asks for a summary, which is a task rather than an invitation', () => {
    for (const prompt of READING_NOTE_PROMPTS) {
      expect(prompt.toLowerCase()).not.toContain('summar');
      expect(prompt.endsWith('?')).toBe(true);
    }
  });
});

describe('readingNoteEyebrow', () => {
  const now = new Date('2026-09-04T08:00:00');

  it('counts calendar days, not elapsed hours', () => {
    // Read at eleven last night, opened at eight this morning: that was yesterday, whatever
    // the nine-hour gap says.
    expect(readingNoteEyebrow(new Date('2026-09-03T23:00:00'), now)).toBe('You read this yesterday');
    expect(readingNoteEyebrow(new Date('2026-09-04T07:55:00'), now)).toBe('You read this today');
  });

  it('says nothing once it is neither today nor yesterday', () => {
    expect(readingNoteEyebrow(new Date('2026-09-02T20:00:00'), now)).toBeNull();
    expect(readingNoteEyebrow('not a date', now)).toBeNull();
  });
});
