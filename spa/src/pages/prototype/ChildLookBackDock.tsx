import { useState } from 'react';
import Icon from '@/components/react/Icon';
import ProtoLoadingDots from './ProtoLoadingDots';
import { ChoiceOptions } from './review-exercises/ChoiceOptions';
import { OrderSlots, OrderTray } from './review-exercises/OrderPieces';
import type { ReviewItemView, ReviewRevealResponse } from '../../hooks/queries/useReview';
import '../../styles/review-exercises.css';

/**
 * Look back: the child's review dock. Adult Review's engine and marking (the server runs the same
 * sitting, rungs and schedule for the child), drawn for a kid and floating over the notebook page
 * in the writing prompt's place.
 *
 * Choices and putting a verse in order are marked by the server against the text. Everything else
 * — a note, a verse to say from memory — is "think, then look", and the child says how it went.
 * Difficulty moves only from how they do; there is no button to make it easier.
 */
export type LookBackSitting = { items: ReviewItemView[]; reveals: Record<string, ReviewRevealResponse>; nextDueAt?: string };
export type LookBackReply = {
  correct?: boolean; finalized: boolean; attemptsLeft?: number; correctAnswer?: string;
  truth?: { verseText: string }; next?: { label: string }; hint?: string; outcome?: string;
};
export type LookBackApi = {
  reveal: (id: string) => Promise<ReviewRevealResponse>;
  answer: (id: string, body: Record<string, unknown>) => Promise<LookBackReply>;
};

type Verdict = 'recalled' | 'almost' | 'revealed';
const verdicts: { id: Verdict; label: string; icon: 'star' | 'circle-check' | 'rotate-left' }[] = [
  { id: 'recalled', label: 'I knew it', icon: 'star' },
  { id: 'almost', label: 'Almost', icon: 'circle-check' },
  { id: 'revealed', label: 'Not yet', icon: 'rotate-left' },
];

function choiceOf(reveal: ReviewRevealResponse | undefined) {
  if (!reveal) return null;
  if (reveal.choice?.options?.length) return { options: reveal.choice.options, opening: reveal.choice.opening, lead: null };
  if (reveal.next?.options?.length) return { options: reveal.next.options, opening: true, lead: null };
  if (reveal.locate?.options?.length) return { options: reveal.locate.options, opening: false, lead: reveal.locate.phrase };
  if (reveal.noteChoice?.options?.length) return { options: reveal.noteChoice.options, opening: false, lead: reveal.noteChoice.fragment };
  return null;
}

export default function ChildLookBackDock({ sitting, api, onClose, onOpenNote, playCue }: {
  sitting: LookBackSitting;
  api: LookBackApi;
  onClose: () => void;
  onOpenNote: (noteId: string) => void;
  playCue: (moment: 'nav.select' | 'nav.toggle' | 'highlight.created' | 'organize.filed' | 'nav.back') => void;
}) {
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [missed, setMissed] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [placed, setPlaced] = useState<number[]>([]);
  const [shown, setShown] = useState(false);
  const [lookedUp, setLookedUp] = useState<ReviewRevealResponse | null>(null);
  const [result, setResult] = useState<LookBackReply | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const items = sitting.items;
  const item = items[index];
  const reveal = item ? sitting.reveals[item.id] : undefined;
  const choice = choiceOf(reveal);
  const order = reveal?.sequence?.phrases?.length ? reveal.sequence.phrases : null;

  function next() {
    playCue('nav.select');
    setIndex(index + 1); setAttempt(1); setMissed([]); setPending(null); setPlaced([]);
    setShown(false); setLookedUp(null); setResult(null); setHint(null); setError('');
  }

  async function send(body: Record<string, unknown>, onMiss?: () => void) {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const reply = await api.answer(item.id, { attemptNumber: attempt, ...body, answer: body.answer ? { ...(body.answer as object), promptKey: item.promptKey } : undefined });
      if (!reply.finalized) {
        playCue('nav.toggle');
        setAttempt(attempt + 1); setHint(reply.hint ?? null); onMiss?.();
      } else {
        playCue(reply.correct === false || reply.outcome === 'revealed' ? 'nav.toggle' : 'highlight.created');
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
    if (item.kind !== 'note' && !reveal?.verseText) {
      try { setLookedUp(await api.reveal(item.id)); } catch { /* the reference still shows */ }
    }
  }

  const done = !item;
  const progress = Math.min(index + (result ? 1 : 0), items.length);
  const verseText = result?.truth?.verseText ?? lookedUp?.verseText ?? reveal?.verseText ?? null;

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
    </div> : <div className="pds-kids-lookback-dock__body" aria-live="polite">
      <span className="pds-kids-lookback-dock__from">{item.kind === 'note' ? item.noteTitle ?? 'One of your notes' : item.scriptureReference}{item.kind !== 'note' && item.translation ? ` · ${item.translation}` : ''}</span>
      <p className="pds-kids-lookback-dock__prompt">{item.prompt}</p>
      {choice?.lead && <p className="pds-kids-lookback-dock__lead">“{choice.lead}”</p>}

      {result ? <div className="pds-kids-lookback-dock__result" data-tone={result.correct === false || result.outcome === 'revealed' ? 'soft' : 'yes'}>
        <strong>{result.correct === false ? 'Good try!' : result.outcome === 'revealed' ? 'Thanks for looking back' : result.outcome === 'almost' ? 'Nice work' : 'Yes!'}</strong>
        {result.correct === false && result.correctAnswer && <span>It was: {result.correctAnswer}</span>}
        {verseText && <blockquote>{verseText}</blockquote>}
        {result.next?.label && <span className="pds-kids-lookback-dock__sub">{result.next.label}</span>}
      </div> : choice ? <>
        <ChoiceOptions options={choice.options} opening={choice.opening} disabled={busy} missed={missed} pending={pending}
          onPick={option => { setPending(option); void send({ outcome: 'almost', answer: { option } }, () => setMissed(current => [...current, option])); }} />
      </> : order ? <>
        <OrderSlots phrases={order} placed={placed} partState={() => undefined} disabled={busy} onRemove={position => setPlaced(placed.filter((_, at) => at !== position))} />
        <OrderTray phrases={order} placed={placed} disabled={busy} onPlace={at => setPlaced([...placed, at])} />
      </> : shown ? <div className="pds-kids-lookback-dock__shown">
        {item.kind === 'note'
          ? item.noteId && <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => onOpenNote(item.noteId!)}><Icon name="book-open" size={14} /> Open my note</button>
          : verseText ? <blockquote>{verseText}</blockquote> : <p className="pds-kids-lookback-dock__sub">{item.scriptureReference}</p>}
        <p className="pds-kids-lookback-dock__sub">How did it go?</p>
      </div> : <p className="pds-kids-lookback-dock__sub">Think about it for a moment first.</p>}

      {hint && !result && <p className="pds-kids-lookback-dock__hint">{hint}</p>}
      {error && <p className="pds-kids-lookback-dock__hint" role="alert">{error}</p>}

      <div className="pds-kids-lookback-dock__actions">
        {result ? <button type="button" className="proto-settings-btn" onClick={next}>{index + 1 < items.length ? <>Next <Icon name="arrow-right" size={13} /></> : 'Finish'}</button>
          : order ? <button type="button" className="proto-settings-btn" disabled={busy || placed.length < order.length} onClick={() => void send({ outcome: 'almost', answer: { order: placed } }, () => setPlaced([]))}>{busy ? <ProtoLoadingDots /> : 'Check'}</button>
          : choice ? null
          : shown ? verdicts.map(verdict => <button key={verdict.id} type="button" className={`proto-settings-btn${verdict.id === 'recalled' ? '' : ' proto-settings-btn--secondary'}`} disabled={busy}
              onClick={() => void send({ outcome: verdict.id })}><Icon name={verdict.icon} size={13} /> {verdict.label}</button>)
          : <button type="button" className="proto-settings-btn" onClick={() => void show()}><Icon name="book-open" size={14} /> {item.kind === 'note' ? 'Show me' : 'Show the verse'}</button>}
      </div>
    </div>}
  </section>;
}
