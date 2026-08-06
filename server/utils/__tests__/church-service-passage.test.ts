import { describe, it, expect } from 'vitest';
import { canonicalizeServiceReference } from '../church-service-passage';

describe('canonicalizeServiceReference', () => {
  it('normalizes casing and spacing to the canonical form', () => {
    expect(canonicalizeServiceReference('  John 3: 16  ')).toEqual({
      ok: true,
      reference: 'John 3:16',
    });
    expect(canonicalizeServiceReference('ROMANS 8:1-11')).toEqual({
      ok: true,
      reference: 'Romans 8:1-11',
    });
  });

  it('expands a chapter-only reference to its full verse range', () => {
    // Not cosmetic — scripture pills require `Book chapter:verse`, so a bare
    // "Romans 8" would never become a pill in anyone's Sunday notes. The cost
    // is that the card reads "Romans 8:1-39" rather than what was typed.
    expect(canonicalizeServiceReference('romans 8')).toEqual({
      ok: true,
      reference: 'Romans 8:1-39',
    });
  });

  it('accepts a verse range', () => {
    const result = canonicalizeServiceReference('Romans 8:1-11');
    expect(result).toEqual({ ok: true, reference: 'Romans 8:1-11' });
  });

  it('treats an empty passage as legal — a topical Sunday has none', () => {
    expect(canonicalizeServiceReference('')).toEqual({ ok: true, reference: null });
    expect(canonicalizeServiceReference('   ')).toEqual({ ok: true, reference: null });
    expect(canonicalizeServiceReference(null)).toEqual({ ok: true, reference: null });
    expect(canonicalizeServiceReference(undefined)).toEqual({ ok: true, reference: null });
  });

  it('rejects an out-of-range chapter with the validator’s own wording', () => {
    const result = canonicalizeServiceReference('Romans 99');
    expect(result.ok).toBe(false);
    // Shown verbatim in the editor — it tells the pastor exactly what to fix.
    if (!result.ok) expect(result.reason).toContain('16 chapters');
  });

  it('rejects an unknown book', () => {
    const result = canonicalizeServiceReference('Hesitations 2:4');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  it('rejects a verse past the end of the chapter', () => {
    const result = canonicalizeServiceReference('Psalm 119:900');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('176 verses');
  });

  it('repairs the dropped-hyphen typo a pastor makes on a phone', () => {
    // iOS predictive text turns "Exodus 16:16-20" into "Exodus 16:1620".
    // Left alone this becomes a pill that can never resolve, in every
    // congregant's Sunday notes.
    expect(canonicalizeServiceReference('Exodus 16:1620')).toEqual({
      ok: true,
      reference: 'Exodus 16:16-20',
    });
  });

  it('repairs only when exactly one split is in range', () => {
    // Psalm 119 has 176 verses, so of 1|234, 12|34 and 123|4 only the middle
    // one is a real ascending range — the repair is determined, not a guess.
    // (repairUnresolvableReference's own doc comment calls this case ambiguous;
    // the code is right and the comment is stale.)
    expect(canonicalizeServiceReference('Psalm 119:1234')).toEqual({
      ok: true,
      reference: 'Psalms 119:12-34',
    });
  });
});
