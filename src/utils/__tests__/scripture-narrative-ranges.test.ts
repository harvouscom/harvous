import { describe, expect, it } from 'vitest';
import { guardNarrativeSubjects } from '../scripture-narrative-ranges';

describe('guardNarrativeSubjects', () => {
  it('drops a narrative subject whose event is not in this chapter', () => {
    // Amos 6 is an OT judgment oracle — "The Passion" (Christ's death) must not stick.
    const out = guardNarrativeSubjects('Amos', 6, ['Judgment', 'Pride', 'The Passion', 'The Exile']);
    expect(out).not.toContain('The Passion');
    expect(out).not.toContain('The Exile'); // historical-exile narrative only, not every prophet
    expect(out).toEqual(expect.arrayContaining(['Judgment', 'Pride']));
  });

  it('removes a wrong narrative subject and injects the headline event for the chapter', () => {
    // Exodus 37 is tabernacle furniture construction, mislabeled "The Prophets".
    const out = guardNarrativeSubjects('Exodus', 37, ['The Prophets']);
    expect(out).toEqual(['The Tabernacle']);
  });

  it('injects a missing headline event while dropping anachronistic narrative subjects', () => {
    // Matthew 27 is the crucifixion; "The Passion" should lead; "The Church" is out of range here.
    const out = guardNarrativeSubjects('Matthew', 27, ['The Church', 'Death', 'Atonement']);
    expect(out[0]).toBe('The Passion');
    expect(out).not.toContain('The Church');
    expect(out).toEqual(expect.arrayContaining(['Death', 'Atonement']));
  });

  it('injects The Early Church on Pentecost and drops The Exile misfire', () => {
    expect(guardNarrativeSubjects('Acts', 2, ['Holy Spirit', 'The Exile'])).toEqual([
      'The Early Church',
      'Holy Spirit',
    ]);
  });

  it('swaps a misused "The Fall" for the in-range headline (1 Chronicles 28 → The Temple)', () => {
    const out = guardNarrativeSubjects('1 Chronicles', 28, ['The Fall', 'Obedience', "David's Reign"]);
    expect(out).not.toContain('The Fall');
    expect(out[0]).toBe('The Temple');
    expect(out).toEqual(expect.arrayContaining(['Obedience', "David's Reign"]));
  });

  it('leaves an in-range narrative subject untouched (Genesis 1 → Creation)', () => {
    expect(guardNarrativeSubjects('Genesis', 1, ['Creation', "God's Sovereignty"])).toEqual([
      'Creation',
      "God's Sovereignty",
    ]);
  });

  it('passes purely thematic subjects through unchanged', () => {
    const out = guardNarrativeSubjects('Romans', 8, ['Holy Spirit', 'Assurance', 'Adoption', 'Hope']);
    expect(out).toEqual(['Holy Spirit', 'Assurance', 'Adoption', 'Hope']);
  });
});
