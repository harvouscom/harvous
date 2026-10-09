import { describe, expect, it } from 'vitest';
import { familyNamePhrase, joinFamilyLabel } from '../family-name';

describe('familyNamePhrase', () => {
  it.each([
    // A bare surname gets the article and "Family"
    ['Castelli', 'the Castelli Family'],
    ['castelli', 'the castelli family'],
    ['Van Buren', 'the Van Buren Family'],
    ['  Castelli  ', 'the Castelli Family'],
    // Already says family: only the article is added, casing kept
    ['Castelli Family', 'the Castelli Family'],
    ['Castelli family', 'the Castelli family'],
    ['Castelli Household', 'the Castelli Household'],
    ['Johnson Crew', 'the Johnson Crew'],
    // Already has "The": lowercased, nothing added
    ['The Castelli Family', 'the Castelli Family'],
    ["The Castelli's", "the Castelli's"],
    ['The Castellis', 'the Castellis'],
    ['the castellis', 'the castellis'],
    // Plural or possessive without "The"
    ["Castelli's", "the Castelli's"],
    ['Castellis’', 'the Castellis’'],
    // Its own phrase already
    ['Our crew', 'Our crew'],
    ["Mom's people", "Mom's people"],
    ['Casa Castelli', 'Casa Castelli'],
    ['Derek and Sam and Kit', 'Derek and Sam and Kit'],
    // Nothing typed
    ['', 'the family'],
  ])('%s → %s', (input, expected) => {
    expect(familyNamePhrase(input)).toBe(expected);
  });
});

describe('joinFamilyLabel', () => {
  it('reads as one sentence', () => {
    expect(joinFamilyLabel('Castelli')).toBe('Join the Castelli Family');
    expect(joinFamilyLabel('The Castelli Family')).toBe('Join the Castelli Family');
    expect(joinFamilyLabel("The Castelli's")).toBe("Join the Castelli's");
  });
});
