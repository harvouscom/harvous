import { describe, expect, it } from 'vitest';
import { mapToSubject, contentSubjects } from '../subject-vocabulary';

describe('mapToSubject', () => {
  it('maps OpenBible-style topic labels to clean controlled subjects', () => {
    expect(mapToSubject('how to be saved')?.name).toBe('Salvation');
    expect(mapToSubject('being born again')?.name).toBe('New Birth');
    expect(mapToSubject("god's love for us")?.name).toBe('Love');
    expect(mapToSubject('god is in control')?.name).toBe("God's Sovereignty");
    expect(mapToSubject('gods creation')?.name).toBe('Creation');
    expect(mapToSubject('intercession')?.name).toBe('Prayer');
  });

  it('returns null for noise topics — the key filter', () => {
    expect(mapToSubject('julius caesar')).toBeNull();
    expect(mapToSubject('dinosaurs')).toBeNull();
    expect(mapToSubject('good luck')).toBeNull();
    expect(mapToSubject('the big bang theory')).toBeNull();
  });
});

describe('contentSubjects', () => {
  it('extracts the subjects a note is about from its text', () => {
    const subs = contentSubjects('I keep trusting God through suffering and grief').map((s) => s.name);
    expect(subs).toContain('Suffering');
    expect(subs).toContain('Grief');
    expect(subs).toContain('Trust');
  });

  it('returns nothing for text with no biblical subjects', () => {
    expect(contentSubjects('the quick brown fox jumped').length).toBe(0);
  });
});
