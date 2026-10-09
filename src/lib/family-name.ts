/**
 * How a family's name reads in a sentence — "Join the Castelli Family".
 *
 * People name a family every way there is: "Castelli", "Castelli Family", "The Castelli
 * Family", "The Castelli's", "The Castellis", "Our crew". This adds only what is missing, and
 * never doubles what they wrote: an article if there isn't one, "Family" only after a bare
 * surname. Their own casing and punctuation are kept.
 */

/** Words that already say "family", so nothing is appended after them. */
const GROUP_WORDS = new Set([
  'family',
  'fam',
  'household',
  'home',
  'house',
  'clan',
  'crew',
  'bunch',
  'folks',
  'tribe',
  'gang',
  'squad',
  'kin',
  'ohana',
  'familia',
  'famiglia',
]);

/** Openers that already make the name a phrase of its own ("Our crew", "Mom's people"). */
const DETERMINERS = new Set(['the', 'our', 'my', 'team', 'casa', 'la', 'los', 'las', 'el', 'die', 'les']);

function words(name: string): string[] {
  return name.split(/\s+/).filter(Boolean);
}

function bare(word: string): string {
  return word.toLowerCase().replace(/[^a-zÀ-ɏ']/g, '');
}

/** "The Castelli's", "The Castellis'", "Castelli's" — already a plural or possessive group. */
function isGroupForm(word: string): boolean {
  return /['’]s$|s['’]$/i.test(word);
}

/**
 * The name as a noun phrase that can follow a verb: "the Castelli Family", "the Castelli's",
 * "our crew". Lowercases a leading "The" so it sits mid-sentence.
 */
export function familyNamePhrase(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return 'the family';
  const list = words(name);
  const first = bare(list[0]);
  const last = bare(list[list.length - 1]);

  // Already led by an article or a possessive determiner: keep it, lowercase "The".
  if (DETERMINERS.has(first)) {
    return first === 'the' ? `the${name.slice(3)}` : name;
  }
  // A first-person possessive ("Mom's people", "Derek's family") reads fine as written.
  if (/['’]s$/i.test(list[0]) && list.length > 1) return name;

  // Ends in a group word: just add the article. "Castelli Family" → "the Castelli Family".
  if (GROUP_WORDS.has(last)) return `the ${name}`;

  // A plural or possessive group: "Castelli's" → "the Castelli's".
  if (list.length === 1 && isGroupForm(list[0])) return `the ${name}`;

  // A bare surname (one or two words, e.g. "Castelli", "Van Buren"): the full phrase.
  if (list.length <= 2) return `the ${name} ${name === name.toLowerCase() ? 'family' : 'Family'}`;

  // Anything longer is its own name ("Derek and Sam and Kit"); leave it alone.
  return name;
}

/** The invite button: "Join the Castelli Family". */
export function joinFamilyLabel(raw: string): string {
  return `Join ${familyNamePhrase(raw)}`;
}
