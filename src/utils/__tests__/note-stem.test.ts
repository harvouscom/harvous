import { describe, it, expect } from 'vitest';
import {
  MIN_STEM_WORDS,
  noteProseText,
  noteStemBlocks,
  noteStemCandidates,
  pickNoteStem,
  splitSentences,
} from '@/utils/note-stem';

const SENTENCE_A =
  'God chose us before the foundation of the world because it pleased him to do so.';
const SENTENCE_B = 'That is the whole ground of adoption and it rests on nothing we brought.';

const NOTE = `
  <h2>Ephesians 1 and the ground of adoption</h2>
  <p>${SENTENCE_A} ${SENTENCE_B}</p>
  <blockquote data-scripture-quote-reference="Ephesians 1:4">
    <p>For he chose us in him before the creation of the world to be holy and blameless.</p>
  </blockquote>
  <ul><li>Chosen before</li><li>Adopted through</li></ul>
`;

describe('noteStemBlocks', () => {
  it('keeps blocks apart rather than flattening the note to one stream', () => {
    const blocks = noteStemBlocks(NOTE);
    const kinds = blocks.map((block) => block.kind);
    expect(kinds).toContain('heading');
    expect(kinds).toContain('paragraph');
    expect(kinds).toContain('scripture-quote');
    expect(kinds.filter((kind) => kind === 'list')).toHaveLength(2);
  });

  it('discards the words of a quoted passage, keeping only the fact that one was there', () => {
    const quote = noteStemBlocks(NOTE).find((block) => block.kind === 'scripture-quote');
    expect(quote).toBeDefined();
    expect(quote?.text).toBe('');
    expect(noteStemBlocks(NOTE).map((b) => b.text).join(' ')).not.toContain('holy and blameless');
  });

  it('takes a pill as its bare reference, with no translation trailing it', () => {
    const html =
      '<p>The promise in <span data-scripture-reference="John 3:16" data-scripture-translation="NET">John 3:16</span> is the hinge of the chapter.</p>';
    const [block] = noteStemBlocks(html);
    expect(block.text).toBe('The promise in John 3:16 is the hinge of the chapter.');
    expect(block.text).not.toContain('NET');
  });

  it('treats a line break as a block boundary, because two lines are two thoughts', () => {
    const blocks = noteStemBlocks('<p>First thought here.<br>Second thought here.</p>');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe('First thought here.');
    expect(blocks[1].text).toBe('Second thought here.');
  });
});

describe('splitSentences', () => {
  it('splits on sentence ends', () => {
    expect(splitSentences('One thing here. Another thing there.')).toEqual([
      'One thing here.',
      'Another thing there.',
    ]);
  });

  it('does not split on the abbreviations people write about a passage with', () => {
    expect(splitSentences('Compare cf. Romans 8 for the same idea.')).toHaveLength(1);
    expect(splitSentences('See v. 12 and the clause that follows it.')).toHaveLength(1);
  });

  it('does not split inside a decimal or an initial', () => {
    expect(splitSentences('The point of 3.16 is the giving.')).toHaveLength(1);
    expect(splitSentences('C. S. Lewis says the same thing twice.')).toHaveLength(1);
  });
});

describe('noteStemCandidates', () => {
  it('never offers a line from a passage the reader quoted', () => {
    const texts = noteStemCandidates(NOTE).map((candidate) => candidate.text);
    expect(texts.join(' ')).not.toContain('holy and blameless');
    expect(texts.join(' ')).not.toContain('creation of the world');
  });

  it('never offers a heading', () => {
    const texts = noteStemCandidates(NOTE).map((candidate) => candidate.text);
    expect(texts.join(' ')).not.toContain('Ephesians 1 and the ground of adoption');
    expect(texts.some((text) => text.startsWith('Ephesians 1 and'))).toBe(false);
  });

  it('never joins two blocks or two sentences into one stem', () => {
    for (const candidate of noteStemCandidates(NOTE)) {
      // The join that used to happen: the tail of one sentence and the head of the next.
      expect(candidate.text).not.toContain('do so. That is');
      expect(candidate.text).not.toContain('Chosen before Adopted');
    }
  });

  it('drops a line that is only a reference, and one that is only pills', () => {
    const html =
      '<p>Romans 8:28</p><p>John 3:16 ESV · Ephesians 2:8</p>' +
      `<p>${SENTENCE_A}</p>`;
    const texts = noteStemCandidates(html).map((candidate) => candidate.text);
    expect(texts).toEqual([SENTENCE_A]);
  });

  it('drops anything under the floor', () => {
    for (const candidate of noteStemCandidates(NOTE)) {
      expect(candidate.words).toBeGreaterThanOrEqual(MIN_STEM_WORDS);
    }
  });

  it('prefers a whole sentence of ordinary length to a run-on', () => {
    const long =
      'This is a very long sentence that keeps going and going without any punctuation to break it up at all which makes it a poor thing to quote back to anybody who wrote it';
    const html = `<p>An opening line that is not the answer.</p><p>${long}</p><p>${SENTENCE_A}</p>`;
    expect(noteStemCandidates(html)[0].text).toBe(SENTENCE_A);
  });

  it('cuts a long sentence at a clause boundary and says that it did', () => {
    const html =
      '<p>Opening line goes here first.</p>' +
      '<p>When Paul writes about adoption in this letter, he is answering a question nobody in the room had thought to ask him yet.</p>';
    const candidate = noteStemCandidates(html).find((entry) => entry.truncated);
    expect(candidate).toBeDefined();
    expect(candidate?.text).toBe('When Paul writes about adoption in this letter');
    expect(candidate?.text.endsWith(',')).toBe(false);
  });

  it('demotes a line that would give its own answer away', () => {
    const html = `<p>An opening line to push the rest along.</p><p>${SENTENCE_A}</p><p>${SENTENCE_B}</p>`;
    const withAvoid = noteStemCandidates(html, { avoid: ['the whole ground of adoption'] });
    expect(withAvoid[0].text).toBe(SENTENCE_A);
    const leaking = withAvoid.find((entry) => entry.text === SENTENCE_B);
    const clean = noteStemCandidates(html).find((entry) => entry.text === SENTENCE_B);
    expect(leaking!.score).toBeLessThan(clean!.score);
  });

  it('has nothing to offer for a note that is all headings and quoted passages', () => {
    expect(noteStemCandidates('<h1>A title</h1><h2>And another</h2>')).toEqual([]);
  });
});

describe('pickNoteStem', () => {
  it('gives the same line for the same seed', () => {
    const seed = 'item-1:0';
    expect(pickNoteStem(NOTE, seed)?.text).toBe(pickNoteStem(NOTE, seed)?.text);
  });

  it('does not ask one note the same question forever', () => {
    const html = [
      '<p>An opening line that is deliberately dull.</p>',
      '<p>The first real sentence carries its own weight here.</p>',
      '<p>The second real sentence carries its own weight here.</p>',
      '<p>The third real sentence carries its own weight here.</p>',
      '<p>The fourth real sentence carries its own weight here.</p>',
    ].join('');
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(pickNoteStem(html, `item:${i}`)?.text ?? '');
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is null when the note has no line worth quoting', () => {
    expect(pickNoteStem('<h1>Only a heading</h1>', 'seed')).toBeNull();
  });
});

describe('noteProseText', () => {
  it('leaves out headings and quoted passages, so even the fallback cannot quote Scripture', () => {
    const prose = noteProseText(NOTE);
    expect(prose).toContain('God chose us');
    expect(prose).not.toContain('holy and blameless');
    expect(prose).not.toContain('Ephesians 1 and the ground');
  });
});
