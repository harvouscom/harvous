/**
 * Write or edit one of a church's review questions (docs/CHURCH_V2_ROADMAP.md §B).
 *
 * A pane docked beside the list in the expanded Review questions tool — the planner's and the
 * library's editor shape (`proto-planner-editor`), not a modal: the list stays in view while
 * you write, and on a narrow screen the pane covers it the way the planner's does.
 *
 * Four kinds: multiple choice, put in order, match the pairs — each written by staff, with the
 * answer marked here and kept on the server — or a passage, which Review asks on the same
 * exercises it uses for a reader's own verses. The same validation runs here and on the server
 * (`src/utils/church-exercise.ts`), so a draft that looks ready is a draft that saves.
 *
 * "Preview" shows the question exactly as a congregant gets it: shuffled by the server, with no
 * sign of which answer is right. Nothing is written until Save or Publish.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import {
  CHURCH_CHOICE_MAX,
  CHURCH_CHOICE_MIN,
  CHURCH_LIST_MAX,
  CHURCH_LIST_MIN,
  CHURCH_PROMPT_MAX,
  validateChurchExerciseContent,
  validateChurchPrompt,
  type AuthoredChurchExerciseKind,
} from '@/utils/church-exercise';
import {
  useChurchReviewActions,
  useChurchReviewPreview,
  type ChurchReviewDraft,
  type ChurchReviewExercise,
  type ChurchReviewPreview,
} from '../../hooks/queries/useChurchReview';

type EditorKind = AuthoredChurchExerciseKind | 'passage';

const KINDS: Array<{ id: EditorKind; label: string }> = [
  { id: 'choice', label: 'Choice' },
  { id: 'order', label: 'Order' },
  { id: 'match', label: 'Match' },
  { id: 'passage', label: 'Passage' },
];

const blank = (n: number) => Array.from({ length: n }, () => '');

export default function PrototypeChurchReviewEditorPane({
  onClose,
  orgId,
  channelId,
  channelTitle,
  exercise,
  canWrite,
}: {
  onClose: () => void;
  orgId: string | null;
  channelId: string;
  channelTitle: string;
  /** Present when editing. The kind cannot change once a question exists. */
  exercise: ChurchReviewExercise | null;
  canWrite: boolean;
}) {
  const actions = useChurchReviewActions(orgId);
  const previewCall = useChurchReviewPreview(orgId);

  const [kind, setKind] = useState<EditorKind>('choice');
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<string[]>(blank(4));
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [items, setItems] = useState<string[]>(blank(3));
  const [pairs, setPairs] = useState<Array<{ left: string; right: string }>>(
    Array.from({ length: 3 }, () => ({ left: '', right: '' })),
  );
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChurchReviewPreview | null>(null);

  /* Seed from the question being edited, or empty — again whenever the selection changes. */
  useEffect(() => {
    setError(null);
    setPreview(null);
    const content = exercise?.content;
    if (!exercise) {
      setKind('choice');
      setPrompt('');
      setOptions(blank(4));
      setCorrectIndex(null);
      setItems(blank(3));
      setPairs(Array.from({ length: 3 }, () => ({ left: '', right: '' })));
      setReference('');
      return;
    }
    setKind(exercise.kind === 'verse' || exercise.kind === 'chapter' ? 'passage' : exercise.kind);
    setPrompt(exercise.prompt ?? '');
    setReference(exercise.scriptureReference ?? '');
    if (content && 'correctIndex' in content) {
      setOptions(content.options);
      setCorrectIndex(content.correctIndex);
    }
    if (content && 'items' in content) setItems(content.items);
    if (content && 'pairs' in content) setPairs(content.pairs);
  }, [exercise]);

  const draft: ChurchReviewDraft = useMemo(() => {
    if (kind === 'passage') return { kind: 'passage', reference };
    if (kind === 'choice') return { kind, prompt, content: { options, correctIndex } };
    if (kind === 'order') return { kind, prompt, content: { items } };
    return { kind, prompt, content: { pairs } };
  }, [kind, prompt, options, correctIndex, items, pairs, reference]);

  /** The same rules the server applies, so a button is only live when the save will succeed. */
  const problem = useMemo(() => {
    if (kind === 'passage') return reference.trim() ? null : 'Enter a passage, like John 15:5 or John 15';
    const p = validateChurchPrompt(prompt);
    if (!p.ok) return p.error;
    const c = validateChurchExerciseContent(kind, draft.content);
    return c.ok ? null : c.error;
  }, [kind, prompt, reference, draft.content]);

  const busy = actions.isPending;
  const editing = Boolean(exercise);
  const isPublished = exercise?.status === 'published';

  async function save(publish: boolean) {
    if (problem || !canWrite) return;
    setError(null);
    try {
      if (exercise) {
        await actions.mutateAsync({ type: 'update', exerciseId: exercise.id, draft });
        if (publish && !isPublished) await actions.mutateAsync({ type: 'publish', exerciseId: exercise.id });
      } else {
        await actions.mutateAsync({ type: 'create', channelId, draft, publish });
      }
      onClose();
      window.toast?.success(publish ? `Published to ${channelTitle}` : 'Saved as a draft');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that');
    }
  }

  async function showPreview() {
    if (problem) return;
    setError(null);
    try {
      setPreview(await previewCall.mutateAsync(draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not preview that');
    }
  }

  const listEditor = (
    values: string[],
    setValues: (next: string[]) => void,
    min: number,
    max: number,
    placeholder: (index: number) => string,
    marker?: (index: number) => ReactNode,
  ) => (
    <div className="proto-church-review-editor__list">
      {values.map((value, index) => (
        <div key={index} className="proto-church-review-editor__list-row">
          {marker ? marker(index) : <span className="proto-church-review-editor__index">{index + 1}</span>}
          <input
            className="proto-settings-field__input proto-church-review-editor__input"
            value={value}
            maxLength={120}
            placeholder={placeholder(index)}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value;
              setValues(next);
              setPreview(null);
            }}
          />
          {values.length > min ? (
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label={`Remove ${index + 1}`}
              onClick={() => {
                setValues(values.filter((_, i) => i !== index));
                if (kind === 'choice' && correctIndex !== null) {
                  setCorrectIndex(correctIndex === index ? null : correctIndex > index ? correctIndex - 1 : correctIndex);
                }
                setPreview(null);
              }}
            >
              <Icon name="xmark" size={11} />
            </button>
          ) : null}
        </div>
      ))}
      {values.length < max ? (
        <button
          type="button"
          className="proto-church-review-editor__add"
          onClick={() => setValues([...values, ''])}
        >
          <Icon name="plus" size={11} /> Add
        </button>
      ) : null}
    </div>
  );

  return (
    <aside className="proto-planner-editor proto-church-review-pane" aria-label={editing ? 'Edit question' : 'New question'}>
      <div className="proto-side-panel__header proto-side-panel__header--minimal">
        <span className="proto-side-panel__header-label">{editing ? 'Edit question' : 'New question'}</span>
        <div className="proto-side-panel__header-actions">
          <button
            type="button"
            className="proto-side-panel__action-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <Icon name="xmark" size={12} />
          </button>
        </div>
      </div>

      <div className="proto-planner-editor__body">
      <div className="proto-church-review-editor">
        {!editing ? (
          <div
            className="proto-appearance-segmented proto-seg-track"
            role="group"
            aria-label="Kind of question"
            style={
              {
                '--proto-seg-count': KINDS.length,
                '--proto-seg-index': Math.max(0, KINDS.findIndex((k) => k.id === kind)),
              } as CSSProperties
            }
          >
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className="proto-appearance-segmented__btn"
                data-active={kind === k.id ? 'true' : 'false'}
                aria-pressed={kind === k.id}
                onClick={() => {
                  setKind(k.id);
                  setPreview(null);
                  setError(null);
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
        ) : null}

        {kind === 'passage' ? (
          <>
            <label className="proto-settings-field">
              <span className="proto-settings-field__label">Passage</span>
              <input
                className="proto-settings-field__input"
                value={reference}
                placeholder="John 15:5, or John 15"
                onChange={(event) => setReference(event.target.value)}
                autoFocus
              />
            </label>
            <p className="proto-caption proto-church-review-editor__hint">
              Asked the way Harvous asks about any passage: filling in blanks, putting phrases in order,
              picking how it begins. Up to three verses stay a verse; anything longer becomes the chapter.
            </p>
          </>
        ) : (
          <>
            <label className="proto-settings-field">
              <span className="proto-settings-field__label">Question</span>
              <textarea
                className="proto-settings-field__input proto-church-review-editor__prompt"
                rows={2}
                value={prompt}
                maxLength={CHURCH_PROMPT_MAX}
                placeholder={
                  kind === 'choice'
                    ? 'Who did Jesus call first?'
                    : kind === 'order'
                      ? 'Put the events of Acts 2 in order'
                      : 'Match each verse to what it says'
                }
                onChange={(event) => {
                  setPrompt(event.target.value.replace(/\n/g, ' '));
                  setPreview(null);
                }}
                autoFocus
              />
            </label>

            {kind === 'choice' ? (
              <>
                <p className="proto-settings-field__label proto-church-review-editor__label">
                  Options <span className="proto-caption">— tap the right one</span>
                </p>
                {listEditor(
                  options,
                  setOptions,
                  CHURCH_CHOICE_MIN,
                  CHURCH_CHOICE_MAX,
                  (i) => `Option ${i + 1}`,
                  (i) => (
                    <button
                      type="button"
                      className={`proto-church-review-editor__correct${correctIndex === i ? ' proto-church-review-editor__correct--on proto-ink-on-accent' : ''}`}
                      aria-pressed={correctIndex === i}
                      aria-label={`Mark option ${i + 1} right`}
                      onClick={() => {
                        setCorrectIndex(i);
                        setPreview(null);
                      }}
                    >
                      {correctIndex === i ? <Icon name="check" size={10} /> : null}
                    </button>
                  ),
                )}
              </>
            ) : null}

            {kind === 'order' ? (
              <>
                <p className="proto-settings-field__label proto-church-review-editor__label">
                  Pieces <span className="proto-caption">— in the right order; readers get them shuffled</span>
                </p>
                {listEditor(items, setItems, CHURCH_LIST_MIN, CHURCH_LIST_MAX, (i) => `Piece ${i + 1}`)}
              </>
            ) : null}

            {kind === 'match' ? (
              <>
                <p className="proto-settings-field__label proto-church-review-editor__label">
                  Pairs <span className="proto-caption">— readers get the right side shuffled</span>
                </p>
                <div className="proto-church-review-editor__list">
                  {pairs.map((pair, index) => (
                    <div key={index} className="proto-church-review-editor__list-row">
                      <input
                        className="proto-settings-field__input proto-church-review-editor__input"
                        value={pair.left}
                        maxLength={80}
                        placeholder="John 3:16"
                        onChange={(event) => {
                          const next = [...pairs];
                          next[index] = { ...pair, left: event.target.value };
                          setPairs(next);
                          setPreview(null);
                        }}
                      />
                      <input
                        className="proto-settings-field__input proto-church-review-editor__input"
                        value={pair.right}
                        maxLength={120}
                        placeholder="For God so loved the world"
                        onChange={(event) => {
                          const next = [...pairs];
                          next[index] = { ...pair, right: event.target.value };
                          setPairs(next);
                          setPreview(null);
                        }}
                      />
                      {pairs.length > CHURCH_LIST_MIN ? (
                        <button
                          type="button"
                          className="proto-side-panel__action-btn"
                          aria-label={`Remove pair ${index + 1}`}
                          onClick={() => setPairs(pairs.filter((_, i) => i !== index))}
                        >
                          <Icon name="xmark" size={11} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {pairs.length < CHURCH_LIST_MAX ? (
                    <button
                      type="button"
                      className="proto-church-review-editor__add"
                      onClick={() => setPairs([...pairs, { left: '', right: '' }])}
                    >
                      <Icon name="plus" size={11} /> Add
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </>
        )}

        {preview ? <ChurchQuestionPreview preview={preview} channelTitle={channelTitle} /> : null}

        {isPublished ? (
          <p className="proto-caption proto-church-review-editor__hint">
            Already published. Saving a change gives everyone who has this question the new version,
            starting fresh.
          </p>
        ) : null}
        {error ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {error}
          </p>
        ) : problem && (prompt || reference) ? (
          <p className="proto-caption proto-church-review-editor__hint">{problem}</p>
        ) : null}
      </div>

      <div className="proto-add-notes-sheet__footer proto-church-review-editor__footer">
        {kind !== 'passage' ? (
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary"
            disabled={Boolean(problem) || previewCall.isPending}
            onClick={() => void showPreview()}
          >
            Preview
          </button>
        ) : null}
        {!isPublished ? (
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary"
            disabled={Boolean(problem) || busy || !canWrite}
            onClick={() => void save(false)}
          >
            {editing ? 'Save' : 'Save draft'}
          </button>
        ) : null}
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={Boolean(problem) || busy || !canWrite}
          onClick={() => void save(true)}
        >
          {busy ? 'Saving…' : isPublished ? 'Save changes' : 'Publish'}
        </button>
      </div>
      </div>
    </aside>
  );
}

/** The question as a congregant sees it — order and columns as the server shuffled them. */
function ChurchQuestionPreview({ preview, channelTitle }: { preview: ChurchReviewPreview; channelTitle: string }) {
  const { reveal } = preview;
  return (
    <div className="proto-church-review-preview" aria-label="Preview">
      <p className="proto-caption proto-church-review-preview__from">From {channelTitle}.</p>
      {preview.prompt ? <p className="proto-church-review-preview__prompt">{preview.prompt}</p> : null}
      {reveal.choice ? (
        <div className="proto-church-review-preview__options">
          {reveal.choice.options.map((option) => (
            <span key={option} className="proto-church-review-preview__chip">
              {option}
            </span>
          ))}
        </div>
      ) : null}
      {reveal.sequence ? (
        <div className="proto-church-review-preview__options">
          {reveal.sequence.phrases.map((phrase) => (
            <span key={phrase} className="proto-church-review-preview__chip">
              {phrase}
            </span>
          ))}
        </div>
      ) : null}
      {reveal.match ? (
        <div className="proto-church-review-preview__columns">
          <div>
            {reveal.match.left.map((left) => (
              <span key={left} className="proto-church-review-preview__chip">
                {left}
              </span>
            ))}
          </div>
          <div>
            {reveal.match.right.map((right) => (
              <span key={right} className="proto-church-review-preview__chip">
                {right}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <p className="proto-caption proto-church-review-editor__hint">
        Shuffled for each person, and never marked until they answer.
      </p>
    </div>
  );
}
