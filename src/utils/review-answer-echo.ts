/**
 * What the reader said, handed back to them once the question is over.
 *
 * A review card used to answer a question and then forget it had asked one. The result showed
 * the right answer and the passage; it never showed the question, and on twenty-two of the
 * twenty-three rungs it never showed what the reader themselves had done. Only free recall
 * echoed an answer, and only because that rung happened to keep its text in local state.
 *
 * That is a strange thing for a memory feature to withhold. The exercise *is* the gap between
 * what you produced and what the text says, and the card was showing one side of it.
 *
 * The difficulty is that every rung submits a different shape — an option string, a word index,
 * an array of typed words, an array of placed positions, a whole sentence — and the marking
 * comes back either per part or as one verdict. This module is the single place that knows all
 * of those shapes, so the card can render one thing.
 *
 * **Dispatch is on the shape of the submission, not on the rung's name.** There are twenty-three
 * rungs across three kinds and more will be added; a switch over prompt keys would be a list to
 * forget to update, and forgetting would mean a reader who answered and was shown nothing. Five
 * shapes cover every rung there is, and anything unrecognised returns null rather than a
 * half-built echo.
 *
 * Pure.
 */

export type ReviewEchoLayout =
  /** One thing chosen: a tapped option, or the single word picked out of an altered verse. */
  | 'line'
  /** Words the reader produced, read as a sentence. */
  | 'words'
  /** Phrases the reader put in an order, read down the page in the order they chose. */
  | 'rows';

/** What the reader actually did, which is what the label above the echo names. */
export type ReviewEchoManner = 'picked' | 'ordered' | 'filled' | 'wrote';

export interface ReviewEchoPart {
  text: string;
  /**
   * How this piece was marked, or undefined where nothing marked it individually.
   *
   * Undefined is a real answer rather than a missing one: writing a verse from its first
   * letters is graded whole, so its words carry no verdict of their own and are shown plainly
   * instead of coloured on a guess.
   */
  state?: 'right' | 'wrong';
}

export interface ReviewAnswerEcho {
  layout: ReviewEchoLayout;
  manner: ReviewEchoManner;
  parts: ReviewEchoPart[];
  /** The whole answer's verdict, where the server gave one. */
  correct?: boolean;
}

/** Exactly what the client sent to be marked. Mirrors the outcome route's answer body. */
export interface ReviewSubmittedAnswer {
  option?: string;
  words?: string[];
  order?: number[];
  wordIndex?: number;
  text?: string;
}

/**
 * What was on screen, for the two submissions that are indices into it.
 *
 * Passed from the render rather than read at handover, because the callback that sends an
 * answer is memoised on the item and would otherwise close over a stale copy of the exercise.
 */
export interface ReviewEchoShown {
  phrases?: readonly string[];
  /** The word behind a tapped index on the altered rung. */
  word?: string;
  /** The options were first-words rather than whole verses, so the echo trails off as they did. */
  opening?: boolean;
}

export interface ReviewAnswerEchoInput {
  submitted: ReviewSubmittedAnswer | null | undefined;
  shown?: ReviewEchoShown | null;
  /** Per-part marks from the server, aligned to what was submitted. */
  parts?: readonly boolean[] | null;
  /** The whole-answer verdict, where there was one to give. */
  correct?: boolean | null;
}

const ELLIPSIS = '…';

/**
 * Per-part marks, or nothing.
 *
 * A length that does not match what was submitted means the two arrays are not describing the
 * same thing, and a mark against the wrong word is worse than no mark at all — so a mismatch
 * drops the marking wholesale and lets the whole-answer verdict speak instead.
 */
function alignedParts(
  parts: readonly boolean[] | null | undefined,
  count: number,
): readonly boolean[] | null {
  if (!parts || parts.length !== count) return null;
  return parts;
}

const stateOf = (marks: readonly boolean[] | null, index: number): 'right' | 'wrong' | undefined =>
  marks ? (marks[index] ? 'right' : 'wrong') : undefined;

/**
 * Build the echo, or null when there is nothing honest to hand back.
 *
 * Null is the right answer on the self-judged rungs: the reader opened the note, read it, and
 * said how it went. There is no answer to echo, and the card is right to show none.
 */
export function reviewAnswerEcho(input: ReviewAnswerEchoInput): ReviewAnswerEcho | null {
  const submitted = input.submitted;
  if (!submitted) return null;
  const correct = typeof input.correct === 'boolean' ? { correct: input.correct } : {};
  const whole = input.correct === true ? 'right' : input.correct === false ? 'wrong' : undefined;

  // A tapped option — every choice rung, on every kind.
  if (typeof submitted.option === 'string' && submitted.option.trim()) {
    const text = submitted.option.trim();
    return {
      layout: 'line',
      manner: 'picked',
      parts: [{ text: input.shown?.opening ? `${text}${ELLIPSIS}` : text, state: whole }],
      ...correct,
    };
  }

  // The altered rung sends the index of the word it believes was changed; the word itself was
  // on screen, so it comes in with `shown`.
  if (Number.isInteger(submitted.wordIndex)) {
    const word = input.shown?.word?.trim();
    // Never echo a bare index at someone. Without the word there is nothing to say.
    if (!word) return null;
    return { layout: 'line', manner: 'picked', parts: [{ text: word, state: whole }], ...correct };
  }

  // An ordering: display positions, resolved back to the phrases they stand for.
  if (Array.isArray(submitted.order)) {
    const phrases = input.shown?.phrases;
    if (!phrases?.length) return null;
    const texts = submitted.order
      .map((position) => phrases[position])
      .filter((text): text is string => typeof text === 'string' && text.length > 0);
    if (!texts.length) return null;
    /*
     * Marks index the *position*, not the phrase: `markVerseSequence` compares
     * `answer[i] === order[i]`, so the third mark is about the third slot the reader filled.
     */
    const marks = alignedParts(input.parts, submitted.order.length);
    return {
      layout: 'rows',
      manner: 'ordered',
      parts: texts.map((text, index) => ({ text, state: stateOf(marks, index) })),
      ...correct,
    };
  }

  // Words typed into gaps, or named from the verse.
  if (Array.isArray(submitted.words)) {
    const marks = alignedParts(input.parts, submitted.words.length);
    const parts = submitted.words
      .map((word, index) => ({ text: word.trim(), state: stateOf(marks, index) }))
      .filter((part) => part.text.length > 0);
    return parts.length ? { layout: 'words', manner: 'filled', parts, ...correct } : null;
  }

  /*
   * A whole sentence written from memory.
   *
   * Split exactly as `markVerseRecall` splits it — trimmed, on runs of whitespace, empties
   * dropped — because the marks come back indexed to *its* split. The card used to split the
   * raw string, so a leading space shifted every mark by one and quietly praised the wrong
   * words.
   */
  if (typeof submitted.text === 'string' && submitted.text.trim()) {
    const words = submitted.text.trim().split(/\s+/).filter(Boolean);
    const marks = alignedParts(input.parts, words.length);
    return {
      layout: 'words',
      manner: 'wrote',
      parts: words.map((text, index) => ({ text, state: stateOf(marks, index) })),
      ...correct,
    };
  }

  return null;
}

/**
 * What the question was about, now that it is over.
 *
 * Deliberately not `rungIdentityIsTheAnswer`. That rule hides the subject *while asking* —
 * "say where this is from" cannot print the reference above itself — and the reason expires the
 * moment the answer is in. On a right answer the server sends no correct answer at all, so this
 * is the only thing that tells the reader which passage they just got.
 *
 * Null where the question already names it, so the card does not say it twice.
 */
export function reviewResultSubject(item: {
  prompt: string;
  scriptureReference?: string | null;
  noteLabel?: string | null;
  noteTitle?: string | null;
}): string | null {
  const subject =
    item.scriptureReference?.trim() || item.noteLabel?.trim() || item.noteTitle?.trim() || null;
  if (!subject) return null;
  return item.prompt.includes(subject) ? null : subject;
}

/**
 * Did the reader's answer and the right answer come out as the same words?
 *
 * The card shows both, and on a correct tap they are one sentence under two headings.
 */
export function echoMatchesAnswer(
  echo: ReviewAnswerEcho | null | undefined,
  correctAnswer: string | null | undefined,
): boolean {
  if (!echo || echo.layout !== 'line' || !correctAnswer) return false;
  const normalise = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, ' ').replace(new RegExp(`${ELLIPSIS}$`), '');
  return normalise(echo.parts[0]?.text ?? '') === normalise(correctAnswer);
}
