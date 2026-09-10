import { describe, it, expect } from 'vitest';
import { NOTE_MARK_PROMPTS, dayIndex, noteMarkPrompt } from '@/utils/note-mark-prompts';

describe('noteMarkPrompt', () => {
  it('asks the same note the same thing all day', () => {
    // A card that survives a reload must not be a different card.
    const day = dayIndex(new Date('2026-09-02T09:00:00'));
    expect(noteMarkPrompt('note_1', day)).toBe(noteMarkPrompt('note_1', day));
  });

  it('turns over between days', () => {
    const days = [0, 1, 2, 3, 4, 5, 6, 7].map((offset) => noteMarkPrompt('note_1', 20000 + offset));
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('rarely asks two notes the same question on the same day', () => {
    const day = dayIndex(new Date('2026-09-02T09:00:00'));
    const asked = ['note_a', 'note_b', 'note_c', 'note_d'].map((id) => noteMarkPrompt(id, day));
    expect(new Set(asked).size).toBeGreaterThan(1);
  });

  it('only ever returns a prompt from the rotation', () => {
    for (let i = 0; i < 50; i++) {
      expect(NOTE_MARK_PROMPTS).toContain(noteMarkPrompt(`note_${i}`, 20000 + i));
    }
  });

  it('asks about the text, not about a state of mind months ago', () => {
    for (const prompt of NOTE_MARK_PROMPTS) {
      expect(prompt).toMatch(/\?$/);
      expect(prompt).not.toMatch(/why did you|what made you/i);
    }
  });
});

describe('dayIndex', () => {
  it('is the reader own midnight, not the server one', () => {
    // Late evening and the following early morning are different days locally.
    expect(dayIndex(new Date('2026-09-02T23:30:00'))).not.toBe(
      dayIndex(new Date('2026-09-03T00:30:00')),
    );
    expect(dayIndex(new Date('2026-09-02T08:00:00'))).toBe(
      dayIndex(new Date('2026-09-02T22:00:00')),
    );
  });
});
