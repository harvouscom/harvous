import { Fragment, useMemo, useState, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import ProtoLoadingDots from './ProtoLoadingDots';
import type { SoundMoment } from '@/utils/sounds';
import { ChoiceOptions } from './review-exercises/ChoiceOptions';
import { OrderSlots, OrderTray } from './review-exercises/OrderPieces';
import { ExerciseStage, heroSize } from './review-exercises/ExerciseStage';
import { PairRail, Rail, slotFill } from './review-exercises/RailSlot';
import { nextOpenGap, WordBankLine, WordTray } from './review-exercises/WordBank';
import { reviewHintLeadCopy, reviewHintLetterCopy, reviewHintWordCopy } from './proto-review-copy';
import type { ReviewItemView, ReviewRevealResponse } from '../../hooks/queries/useReview';
import '../../styles/review-exercises.css';

/**
 * Look back: the child's review dock. Adult Review's engine and marking (the server runs the same
 * sitting, rungs and schedule for the child), drawn for a kid and floating over the notebook page
 * in the writing prompt's place.
 *
 * Laid out with adult Review's own stage, rail, answer cards, word tiles and order pieces. Every
 * question a child is sent is answered by tapping and marked by the server — the answer stays on
 * the card, marked, with the verdict in the footer band — except saying a verse from memory: they
 * say it aloud, look, and say how it went, because there is the verse to check against. A note is
 * never self-rated (adult turned that rung off, Oct 2026). The server keeps the typing-only asks
 * out of a child's sitting and always gives blanks as word tiles (`review-service.ts`).
 * Difficulty moves only from how they do; there is no button to make it easier.
 */
export type LookBackSitting = { items: ReviewItemView[]; reveals: Record<string, ReviewRevealResponse>; nextDueAt?: string };
export type LookBackReply = {
  correct?: boolean; finalized: boolean; attemptsLeft?: number; correctAnswer?: string;
  truth?: { verseText: string }; next?: { label: string; recallState?: string }; outcome?: string;
  /** Which parts of a built answer landed — a gap each, a place each. */
  parts?: boolean[];
  hint?: Hint;
};
export type LookBackApi = {
  reveal: (id: string) => Promise<ReviewRevealResponse>;
  answer: (id: string, body: Record<string, unknown>) => Promise<LookBackReply>;
};

type Hint =
  | { kind: 'blank'; index: number; word: string }
  | { kind: 'lead'; text: string }
  | { kind: 'word'; word: string }
  | { kind: 'letter'; letter: string };
/** A hint the server gave after a miss, said as adult Review says it. A gap hint is placed, not said. */
function hintCopy(hint: Hint | null) {
  if (!hint || hint.kind === 'blank') return null;
  return hint.kind === 'lead' ? reviewHintLeadCopy(hint.text) : hint.kind === 'word' ? reviewHintWordCopy(hint.word) : reviewHintLetterCopy(hint.letter);
}

type Verdict = 'recalled' | 'almost' | 'revealed';
/** Adult Review's sounds, by the verdict the card is about to say. Never a buzzer. */
const VERDICT_SOUND: Record<Verdict, SoundMoment> = { recalled: 'review.right', almost: 'review.almost', revealed: 'review.miss' };
const verdicts: { id: Verdict; label: string; icon: 'star' | 'circle-check' | 'rotate-left' }[] = [
  { id: 'recalled', label: 'I knew it', icon: 'star' },
  { id: 'almost', label: 'Almost', icon: 'circle-check' },
  { id: 'revealed', label: 'Not yet', icon: 'rotate-left' },
];

/**
 * A note is asked what goes with it — the passage it is about, the note it links to — exactly the
 * two rungs adult Review asks (the self-rated Takeaway is off there too). Said for a kid.
 */
const NOTE_ASK: Record<string, { task: string; slot: string; variant?: 'note' }> = {
  'note.passage': { task: 'Which Bible passage is this note about?', slot: 'It’s about' },
  'note.connect': { task: 'Which note did you link to this one?', slot: 'Linked to', variant: 'note' },
};

type Choice = { kind: 'context' | 'next' | 'before' | 'locate' | 'note'; options: string[]; opening: boolean; phrase?: { text: string; leading?: boolean; trailing?: boolean } };
function choiceOf(reveal: ReviewRevealResponse | undefined): Choice | null {
  if (!reveal) return null;
  if (reveal.choice?.options?.length) return { kind: 'context', options: reveal.choice.options, opening: reveal.choice.opening };
  if (reveal.next?.options?.length) return { kind: 'next', options: reveal.next.options, opening: true };
  if (reveal.before?.options?.length) return { kind: 'before', options: reveal.before.options, opening: true };
  if (reveal.locate?.options?.length) return { kind: 'locate', options: reveal.locate.options, opening: false,
    phrase: { text: reveal.locate.phrase, leading: reveal.locate.leading, trailing: reveal.locate.trailing } };
  if (reveal.noteChoice?.options?.length) return { kind: 'note', options: reveal.noteChoice.options, opening: false };
  return null;
}

/** What the card says once it is marked: a kid's words over adult Review's verdict. */
function resultLine(result: LookBackReply, selfRated: boolean) {
  // Their own verdict is thanked, not confirmed: nothing marked it.
  if (selfRated) return result.outcome === 'revealed' ? { icon: 'seedling' as const, title: 'Thanks for looking back', tone: 'soft' }
    : { icon: 'star' as const, title: result.outcome === 'almost' ? 'Nearly there!' : 'Great remembering!', tone: 'yes' };
  if (result.correct === false) return { icon: 'seedling' as const, title: 'Good try!', tone: 'soft' };
  if (result.outcome === 'revealed') return { icon: 'seedling' as const, title: 'Thanks for looking back', tone: 'soft' };
  if (result.outcome === 'almost') return { icon: 'circle-check' as const, title: 'Nice work!', tone: 'yes' };
  return { icon: 'star' as const, title: 'Yes, that’s it!', tone: 'yes' };
}

export default function ChildLookBackDock({ sitting, api, onClose, onOpenNote, playCue }: {
  sitting: LookBackSitting;
  api: LookBackApi;
  onClose: () => void;
  onOpenNote: (noteId: string) => void;
  /** The child's own sound setting decides whether these play (see ChildNotebookAppearance). */
  playCue: (moment: SoundMoment) => void;
}) {
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [missed, setMissed] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [placed, setPlaced] = useState<number[]>([]);
  const [words, setWords] = useState<string[]>([]);
  const [given, setGiven] = useState<Map<number, string>>(() => new Map());
  const [parts, setParts] = useState<boolean[] | null>(null);
  const [spentWords, setSpentWords] = useState<number[]>([]);
  const [shown, setShown] = useState(false);
  const [lookedUp, setLookedUp] = useState<ReviewRevealResponse | null>(null);
  const [result, setResult] = useState<LookBackReply | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /*
   * A note comes with a question it can be marked on, or the server does not send it (adult
   * Review drops an unaskable note the same way). One without its question is left out here
   * rather than turned into a "how did it go?" card about nothing.
   */
  const items = sitting.items.filter(entry => entry.kind !== 'note' || choiceOf(sitting.reveals[entry.id]));
  const item = items[index];
  const reveal = item ? sitting.reveals[item.id] : undefined;
  const choice = choiceOf(reveal);
  const order = reveal?.sequence?.phrases?.length ? reveal.sequence.phrases : null;
  const cloze = reveal?.cloze?.blankLengths?.length && reveal.cloze.bank?.length ? reveal.cloze : null;
  const altered = reveal?.altered?.tokens?.length ? reveal.altered.tokens : null;

  function next() {
    // The end of a sitting is heard on the tap that reaches it, as in adult Review.
    playCue(index + 1 >= items.length ? 'review.sittingDone' : 'nav.select');
    setIndex(index + 1); setAttempt(1); setMissed([]); setPending(null); setPicked(null); setPlaced([]);
    setWords([]); setGiven(new Map()); setParts(null); setSpentWords([]);
    setShown(false); setLookedUp(null); setResult(null); setHint(null); setError('');
  }

  async function send(body: Record<string, unknown>, onMiss?: (reply: LookBackReply) => void) {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const reply = await api.answer(item.id, { attemptNumber: attempt, ...body, answer: body.answer ? { ...(body.answer as object), promptKey: item.promptKey } : undefined });
      setParts(reply.parts ?? null);
      if (!reply.finalized) {
        playCue('review.tryAgain');
        setAttempt(attempt + 1); setHint(reply.hint ?? null); onMiss?.(reply);
      } else {
        // As adult Review: the answer that moves an item into holding gets the fuller chord instead.
        const verdict = (reply.outcome ?? (reply.correct === false ? 'revealed' : 'recalled')) as Verdict;
        const crossedToDurable = item.recallState !== 'durable' && reply.next?.recallState === 'durable';
        playCue(crossedToDurable ? 'review.holding' : VERDICT_SOUND[verdict] ?? 'review.almost');
        setHint(null);
        setResult(reply);
      }
    } catch {
      setError('That didn’t save. Try again.');
    } finally {
      setBusy(false); setPending(null);
    }
  }

  async function show() {
    if (!item) return;
    playCue('nav.select');
    setShown(true);
    if (!reveal?.verseText) {
      try { setLookedUp(await api.reveal(item.id)); } catch { /* the reference still shows */ }
    }
  }

  /* After a miss on the blanks: the gaps that landed stay, the rest empty for another go, and a
     gap the server filled in as a hint is placed and locked. */
  function afterGapMiss(reply: LookBackReply) {
    const landed = reply.parts ?? [];
    const kept = words.map((word, at) => (landed[at] ? word : ''));
    const nextGiven = new Map(given);
    if (reply.hint?.kind === 'blank') { nextGiven.set(reply.hint.index, reply.hint.word); kept[reply.hint.index] = reply.hint.word; }
    setGiven(nextGiven); setWords(kept);
  }

  const done = !item;
  const progress = Math.min(index + (result ? 1 : 0), items.length);
  const verseText = result?.truth?.verseText ?? lookedUp?.verseText ?? reveal?.verseText ?? null;
  // Memoized: an inline `{ __html }` re-applies innerHTML every render and loses a selection.
  const verseMarkup = useMemo(() => (verseText ? { __html: verseText } : null), [verseText]);
  const noteAsk = item?.kind === 'note' ? NOTE_ASK[item.promptKey] ?? NOTE_ASK['note.passage'] : null;
  const noteName = item?.noteTitle?.trim() || item?.noteLabel?.trim() || 'Your note';
  /* Marked by the server only; the page holds no answer key. */
  const rightOption = result && result.correct !== false ? picked : null;
  const lastMissed = missed[missed.length - 1] ?? null;
  const fill = slotFill({ pending, correct: rightOption ?? (result?.correct === false ? result.correctAnswer ?? null : null), wrong: result ? null : lastMissed });
  const where = item && item.kind !== 'note' ? `${item.scriptureReference ?? ''}${item.translation ? ` · ${item.translation}` : ''}` : null;
  const selfRated = !!item && !choice && !order && !cloze && !altered;
  const line = result ? resultLine(result, selfRated) : null;
  const recall = reveal?.recall ?? null;
  const keywords = reveal?.keywords ?? null;
  const partState = (at: number): 'right' | 'wrong' | undefined => {
    if (result) return result.correct === false ? (parts ? (parts[at] ? 'right' : 'wrong') : 'wrong') : 'right';
    return undefined;
  };
  /* A gap that landed on a miss stays, marked; the rest are open again. */
  const gapState = (at: number): 'right' | 'wrong' | undefined => (!result && parts ? (parts[at] ? 'right' : undefined) : partState(at));
  const gapsFilled = !!cloze && cloze.blankLengths.every((_, at) => Boolean(words[at]?.trim()));

  const verse = <p className="rx-hero" data-scripture="" data-size={heroSize(verseText)} dangerouslySetInnerHTML={verseMarkup ?? undefined} />;
  const eyebrow = where ? <p className="rx-eyebrow">{where}</p> : null;

  /*
   * The ask, said for a kid where the engine's own words are a grown-up's. Every other prompt is
   * the engine's, already plain ("Put John 1:5 back in order.").
   */
  let task: ReactNode = item?.prompt ?? '';
  if (noteAsk) task = noteAsk.task;
  else if (choice?.kind === 'next') task = 'What comes after this verse?';
  else if (choice?.kind === 'before') task = 'Which of these comes first?';
  else if (altered) task = 'One word has changed. Can you find it?';
  else if (cloze) task = 'Put the missing words back.';
  else if (selfRated && keywords) task = `Can you name ${keywords.count} ${keywords.count === 1 ? 'word' : 'words'} from ${item?.scriptureReference ?? 'this verse'}?`;
  else if (selfRated && recall?.shown) task = 'Can you finish this verse?';
  else if (selfRated) task = `Can you say ${item?.scriptureReference ?? 'this verse'} from memory?`;

  /*
   * The scene is what the question is about, as in adult Review: the note and the place its answer
   * goes; the verse, with "what comes next" beside it; the verse with its gaps; the phrase to place;
   * the verse itself for a context question. Never the answer — a rung that withholds the verse
   * sends no text to show, and a memory card shows it only once the child has tried.
   */
  let scene: ReactNode = null;
  let sceneNamesVerse = false;
  if (item && noteAsk) {
    scene = <Rail fromLabel="Your note" from={<p>{noteName}</p>} slotLabel={noteAsk.slot} fill={fill} join="link" />;
  } else if (order) {
    scene = <OrderSlots phrases={order} placed={placed} partState={partState} disabled={busy || !!result} onRemove={position => setPlaced(placed.filter((_, at) => at !== position))} />;
  } else if (cloze && !(result && verseMarkup)) {
    scene = <WordBankLine hero={heroSize(cloze.segments.join(' '))} segments={cloze.segments} blankLengths={cloze.blankLengths} values={words} given={given}
      partState={gapState} disabled={busy || !!result} onClear={at => { const kept = [...words]; kept[at] = ''; setWords(kept); }} />;
  } else if (altered && !(result && verseMarkup)) {
    scene = <><p className="rx-eyebrow">One word here isn’t what the verse says</p>
      <p className="rx-hero" data-size={heroSize(altered.join(' '))}>{altered.map((token, at) => <Fragment key={`${at}-${token}`}>{at > 0 ? ' ' : null}
        <button type="button" className="proto-review-dock__altered-word" disabled={busy || !!result || spentWords.includes(at)}
          data-answer={spentWords.includes(at) ? 'wrong' : pending === String(at) ? 'picked' : undefined}
          onClick={() => { setPending(String(at)); void send({ outcome: 'almost', answer: { wordIndex: at } }, () => setSpentWords(current => [...current, at])); }}>{token}</button>
      </Fragment>)}</p></>;
  } else if (choice?.kind === 'next' && verseMarkup) {
    scene = <Rail fromLabel={item?.scriptureReference ?? 'This verse'} from={<p dangerouslySetInnerHTML={verseMarkup} />} scripture slotLabel="What comes next" fill={fill} trailing slotScripture />;
  } else if (choice?.kind === 'before' && !result) {
    scene = <PairRail options={choice.options} fill={fill} />;
  } else if (choice?.kind === 'locate' && choice.phrase && !result) {
    scene = <p className="rx-hero" data-scripture="" data-size={heroSize(choice.phrase.text)}>“{choice.phrase.leading ? '…' : ''}{choice.phrase.text}{choice.phrase.trailing !== false ? '…' : ''}”</p>;
  } else if ((choice?.kind === 'context' || result || (selfRated && shown)) && verseMarkup) {
    scene = <>{eyebrow}{verse}</>; sceneNamesVerse = true;
  } else if (selfRated && recall?.shown) {
    scene = <>{eyebrow}<p className="rx-hero" data-scripture="" data-size={heroSize(recall.shown)}>{recall.shown} …</p></>; sceneNamesVerse = true;
  } else if (selfRated && shown) {
    scene = <>{eyebrow}<p className="rx-hero">{item?.scriptureReference}</p></>; sceneNamesVerse = true;
  }

  const hintText = hintCopy(hint);
  const say = line ? <>
    <p className="pds-kids-lookback-dock__verdict" data-tone={line.tone}><span aria-hidden="true"><Icon name={line.icon} size={14} /></span>{line.title}</p>
    {result?.correct === false && result.correctAnswer && !noteAsk && !verseMarkup && <p className="pds-kids-lookback-dock__note">It was: {result.correctAnswer}</p>}
    {result?.next?.label && <p className="pds-kids-lookback-dock__note">{result.next.label}</p>}
  </> : error ? <p className="pds-kids-lookback-dock__note" role="alert">{error}</p>
    : hintText ? <p className="pds-kids-lookback-dock__note">{hintText}</p>
    : (lastMissed || spentWords.length || (parts && !result)) ? <p className="pds-kids-lookback-dock__note">Not quite. Have another go!</p>
    : selfRated && !shown ? <p className="pds-kids-lookback-dock__note">Say it out loud or in your head first.</p>
    : selfRated && shown ? <p className="pds-kids-lookback-dock__note">How did it go?</p>
    : null;

  const actions = result ? <>
    {item?.kind === 'note' && item.noteId && <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => onOpenNote(item.noteId!)}>Open note</button>}
    <button type="button" className="proto-settings-btn" onClick={next}>{index + 1 < items.length ? <>Next <Icon name="arrow-right" size={13} /></> : 'Finish'}</button>
  </> : order ? <button type="button" className="proto-settings-btn" disabled={busy || placed.length < order.length} onClick={() => void send({ outcome: 'almost', answer: { order: placed } }, () => setPlaced([]))}>{busy ? <ProtoLoadingDots /> : 'Check'}</button>
    : cloze ? <button type="button" className="proto-settings-btn" disabled={busy || !gapsFilled} onClick={() => void send({ outcome: 'almost', answer: { words: cloze.blankLengths.map((_, at) => words[at] ?? '') } }, afterGapMiss)}>{busy ? <ProtoLoadingDots /> : 'Check'}</button>
    : selfRated && shown ? verdicts.map(verdict => <button key={verdict.id} type="button" className={`proto-settings-btn${verdict.id === 'recalled' ? '' : ' proto-settings-btn--secondary'}`} disabled={busy}
        onClick={() => void send({ outcome: verdict.id })}><Icon name={verdict.icon} size={13} /> {verdict.label}</button>)
    : selfRated ? <button type="button" className="proto-settings-btn" onClick={() => void show()}><Icon name="book-open" size={14} /> Show me</button>
    : null;

  return <section className="pds-kids-lookback-dock" aria-label="Look back">
    <header className="pds-kids-lookback-dock__head">
      <span className="pds-kids-lookback-dock__title"><Icon name="rotate-left" size={14} aria-hidden /> Look back</span>
      {!!items.length && <span className="pds-kids-lookback-dock__dots" aria-label={`${progress} of ${items.length} done`}>
        {items.map((entry, at) => <i key={entry.id} data-state={at < progress ? 'done' : at === index ? 'now' : undefined} />)}
      </span>}
      <button type="button" className="proto-toolbar-icon-btn" aria-label="Close Look back" onClick={() => { playCue('nav.back'); onClose(); }}><Icon name="xmark" size={15} /></button>
    </header>

    {done ? <div className="pds-kids-lookback-dock__body pds-kids-lookback-dock__body--done">
      <span className="pds-kids-lookback-dock__badge" aria-hidden="true"><Icon name="star" size={20} /></span>
      <p className="pds-kids-lookback-dock__prompt">{items.length ? 'That’s all for today!' : 'Nothing to look back on yet'}</p>
      <p className="pds-kids-lookback-dock__sub">{items.length ? 'These will come back when it’s a good time to see them again.' : 'Highlight a verse or write a note, and it will show up here.'}</p>
      <button type="button" className="proto-settings-btn" onClick={onClose}>Done</button>
    </div> : <div className="pds-kids-lookback-dock__stage" aria-live="polite" data-result={result ? line?.tone : undefined}>
      <ExerciseStage
        fit
        task={task}
        subject={noteAsk || choice?.kind === 'next' || choice?.kind === 'before' || (choice?.kind === 'locate' && !result) || (sceneNamesVerse && eyebrow) ? null : where}
        scene={scene}
        sceneTone={altered && !result ? 'altered' : undefined}
        missed={!result && (!!hint || !!lastMissed || spentWords.length > 0 || !!parts)}
        say={say}
        actions={actions}
      >
        {choice ? <ChoiceOptions options={choice.options} opening={choice.opening} disabled={busy || !!result} missed={missed} pending={pending} correct={rightOption}
          variant={noteAsk?.variant}
          onPick={option => { setPending(option); setPicked(option); void send({ outcome: 'almost', answer: { option } }, () => setMissed(current => [...current, option])); }} />
          : order && !result ? <OrderTray phrases={order} placed={placed} disabled={busy} onPlace={at => setPlaced([...placed, at])} />
          : cloze && !result ? <WordTray bank={cloze.bank!} values={words} disabled={busy} onPlace={word => {
              const at = nextOpenGap(cloze.blankLengths.length, words, given);
              if (at === null) return;
              const filled = [...words]; filled[at] = word; setWords(filled); setParts(null);
            }} />
          : null}
      </ExerciseStage>
    </div>}
  </section>;
}
