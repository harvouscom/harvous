import { describe, expect, it } from 'vitest';
import { detectEmotionalTone, MIN_TONE_MATCHES } from '../bible-study-tone-lexicon';

describe('detectEmotionalTone', () => {
  it('returns null for empty or signal-free text', () => {
    expect(detectEmotionalTone('').tone).toBeNull();
    expect(detectEmotionalTone('The meeting is at noon on Tuesday.').tone).toBeNull();
  });

  it('detects a dominant lament tone', () => {
    const r = detectEmotionalTone('My heart is broken with grief and sorrow; I weep in anguish.');
    expect(r.tone).toBe('lament');
    expect(r.scores.lament).toBeGreaterThanOrEqual(MIN_TONE_MATCHES);
  });

  it('detects gratitude via stems and exact words', () => {
    const r = detectEmotionalTone('I am so thankful and grateful for His provision and blessings.');
    expect(r.tone).toBe('gratitude');
  });

  it('detects fear/anxiety inflections via stems', () => {
    const r = detectEmotionalTone('I feel anxious and worried, gripped by dread and uncertainty.');
    expect(r.tone).toBe('fear');
  });

  it('requires a minimum number of matches before claiming a tone', () => {
    // A single "hope" word is below MIN_TONE_MATCHES.
    const r = detectEmotionalTone('There is hope in this passage.');
    expect(r.tone).toBeNull();
    expect(r.scores.hope).toBe(1);
  });

  it('returns null on a tie between two tones (no defensible dominant)', () => {
    // Two joy words and two fear words → tie → null.
    const r = detectEmotionalTone('joy and delight, yet fear and dread.');
    expect(r.tone).toBeNull();
  });

  it('does not match tone words as substrings of unrelated words', () => {
    // "awe" must not fire on "aware"/"awesome"; "sin" must not fire on "single".
    const r = detectEmotionalTone('I was aware it was a single ordinary morning.');
    expect(r.scores.awe ?? 0).toBe(0);
    expect(r.scores.conviction ?? 0).toBe(0);
  });
});
