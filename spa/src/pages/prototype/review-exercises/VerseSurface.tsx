/**
 * The cards where the verse itself is the thing handled: first letters that fill as you write,
 * the words left to write counted off, and a highlighter that paints what you point at.
 *
 * None of these mark anything. The page holds no answer key: the tiles compare a typed word only
 * with the first letter the card already shows, the ticks count words and never read them, and
 * the highlighter shows where an option sits in the verse on screen. Every verdict is still the
 * server's.
 */
import { useState, type ReactNode } from 'react';
import { ExerciseStage } from './ExerciseStage';
import { ChoiceOptions } from './ChoiceOptions';

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** The first letter of a word, skipping any quote or bracket in front of it. */
function initialOf(token: string): string {
  return (token.match(/[\p{L}\p{N}]/u)?.[0] ?? '').toLowerCase();
}

/** What follows the letters in a token — the punctuation the skeleton carries, kept on the tile. */
function trailingPunctuation(token: string): string {
  return token.match(/[^\p{L}\p{N}]+$/u)?.[0] ?? '';
}

/**
 * The whole-verse skeleton as tiles: one per word, each showing its first letter until a word is
 * written for it, then the reader's own word.
 *
 * A written word whose first letter is not the tile's is shown off, gently: that letter is on the
 * card already, so saying it does not match gives nothing away — it only tells the reader they
 * have lost their place, which is the one thing a line of initials makes easy to do.
 */
export function InitialsTiles({ initials, typed }: { initials: string; typed: string }) {
  const tokens = words(initials);
  const written = words(typed);
  return (
    <p className="rx-initials" data-scripture="" aria-label={`First letters: ${initials}`}>
      {tokens.map((token, index) => {
        const word = written[index];
        const off = word !== undefined && initialOf(word) !== initialOf(token);
        return (
          <span
            key={index}
            className="rx-initial"
            data-written={word !== undefined ? '' : undefined}
            data-off={off ? '' : undefined}
            data-current={index === written.length ? '' : undefined}
            aria-hidden
          >
            {word !== undefined ? `${word.replace(/[^\p{L}\p{N}'’-]+$/u, '')}${trailingPunctuation(token)}` : token}
          </span>
        );
      })}
    </p>
  );
}

/**
 * How far there is to go, as ticks: one per word left to write, filled as words are written.
 * Counted, never read — a filled tick means a word was written, not that it was the right one.
 */
export function WordTicks({ total, typed }: { total: number; typed: string }) {
  const written = Math.min(total, words(typed).length);
  return (
    <div
      className="rx-ticks"
      role="img"
      aria-label={`${written} of ${total} words written`}
    >
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className="rx-tick" data-filled={index < written ? '' : undefined} />
      ))}
    </div>
  );
}

/**
 * The verse as plain text, from the reveal's markup, without its inline verse number — the
 * highlighter has to find the option's words in what is on screen, and a "19" run into the first
 * word would stop the opening window ever matching.
 */
export function plainVerse(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, '').trim();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('sup').forEach((sup) => sup.remove());
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Where a phrase sits in the verse, matched loosely on case and spacing. */
export function phraseRange(text: string, phrase: string | null | undefined): [number, number] | null {
  if (!phrase) return null;
  const hay = text.toLowerCase();
  const needle = phrase.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!needle) return null;
  const at = hay.indexOf(needle);
  return at < 0 ? null : [at, at + needle.length];
}

export function MarkedVerse({
  text,
  phrase,
  state,
}: {
  text: string;
  phrase: string | null;
  /** How the painted words read: pointed at, on their way, marked right or wrong. */
  state: 'preview' | 'picked' | 'right' | 'wrong' | null;
}) {
  const range = phraseRange(text, phrase);
  return (
    <p className="rx-hero" data-scripture="" data-size={text.length > 170 ? 'md' : 'lg'}>
      {range ? (
        <>
          {text.slice(0, range[0])}
          <mark className="rx-mark" data-state={state ?? undefined}>
            {text.slice(range[0], range[1])}
          </mark>
          {text.slice(range[1])}
        </>
      ) : (
        text
      )}
    </p>
  );
}

/**
 * "Pick the words you marked": the verse, and the four windows of it. Pointing at an option
 * paints its words in the verse with the highlighter, so the choice is made on the verse — where
 * the reader made the mark — rather than between four lines out of context. Tapping answers, as
 * on every choice rung.
 */
export function MarkedExercise({
  task,
  subject,
  verse,
  options,
  disabled,
  missed,
  correct,
  pending,
  wrong,
  say,
  missedNow,
  onPick,
}: {
  task: ReactNode;
  subject?: ReactNode;
  /** The verse, plain text. */
  verse: string;
  options: readonly string[];
  disabled: boolean;
  missed: readonly string[];
  correct: string | null;
  pending: string | null;
  /** The last option marked wrong, still painted until the next tap. */
  wrong: string | null;
  say?: ReactNode;
  /** A miss is showing, so the footer band carries it. */
  missedNow: boolean;
  onPick: (option: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const painted = pending ?? correct ?? preview ?? wrong;
  const state = pending ? 'picked' : correct ? 'right' : preview ? 'preview' : wrong ? 'wrong' : null;
  return (
    <ExerciseStage
      task={task}
      subject={subject}
      scene={<MarkedVerse text={verse} phrase={painted} state={state} />}
      say={say}
      missed={missedNow}
    >
      <ChoiceOptions
        options={options}
        disabled={disabled}
        missed={missed}
        correct={correct}
        pending={pending}
        onPick={onPick}
        onPreview={setPreview}
      />
    </ExerciseStage>
  );
}
