/**
 * Scan a page — the web's answer to the native app's text scanner.
 *
 * Built from the import surface's pieces where they fit, because it is the same promise at a
 * smaller size: paper you already have becomes a note. The progress bar is the import bar and
 * the end is an import-style summary. What was found is a strip of Discover-style cards
 * (ScanStrip): the photo, then each verse in the translation its pill will carry.
 *
 * Scripture is the point of the review. Every reference found is a card showing the verse in
 * the translation its pill will carry — the one printed beside it on the page, else the
 * reader's default — and each can be changed or un-pilled before anything is written. A page that is itself a
 * Bible passage is recognised as one, and the note quotes our text of it, never the scan.
 *
 * Nothing is saved until "Create note": the note is a compose seed, like Today's passage.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import '../../../styles/scan-sheet.css';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { getTranslationAbbreviationDisplay, TRANSLATION_ORDER } from '@/data/translations';
import { findScriptureInOcrText } from '@/utils/ocr/ocr-scripture';
import type { IdentifiedPassage } from '@/utils/ocr/passage-match';
import ProtoPopoverShell from '../ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from '../ProtoDialogBackdrop';
import ProtoSelectMenu, { type ProtoSelectOption } from '../ProtoSelectMenu';
import ProtoProgressBar from '../import/ProtoProgressBar';
import { useDismissOnOutside } from '../../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../../hooks/useProtoOverlayMotion';
import { useSheetPresentation } from '../design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from '../useProtoAnchoredPopoverPosition';
import { buildScannedPassageNoteHtml, buildScannedTextNoteHtml, resolveScanTranslation } from '../../../lib/scan-note-html';
import type { PrototypeComposeSeed } from '../../../layouts/proto-shell-context';
import { SCAN_TEXT_ACCEPT } from './scan-text-events';
import { useScanText, type ScanState } from './useScanText';
import ScanStrip from './ScanStrip';
import ScanPageViewer from './ScanPageViewer';
import ScanPageText from './ScanPageText';

/** A page this much made of one passage is that passage; below it, it is a page that quotes one. */
const PASSAGE_PAGE_PRECISION = 0.5;

/** Rotating lines while the page is read, so a long read does not look like a frozen one. */
const READING_LINES = ['Reading the page…', 'Taking it line by line…', 'Looking for Scripture…'];

const TRANSLATION_OPTIONS: ProtoSelectOption<string>[] = TRANSLATION_ORDER.map((id) => ({
  value: id,
  label: getTranslationAbbreviationDisplay(id),
}));

export interface ScanTextSheetProps {
  open: boolean;
  file: File | null;
  onRetake: (file: File) => void;
  onClose: () => void;
  onCreate: (seed: PrototypeComposeSeed) => void;
}

function ReadingStatus({ state }: { state: ScanState }) {
  const [lineIndex, setLineIndex] = useState(0);
  const reading = state.phase === 'reading' && state.progress.stage === 'reading';
  useEffect(() => {
    if (!reading) return undefined;
    const timer = window.setInterval(() => setLineIndex((i) => (i + 1) % READING_LINES.length), 4200);
    return () => window.clearInterval(timer);
  }, [reading]);

  if (state.phase === 'matching') {
    return <ProtoProgressBar indeterminate label="Matching the passage and translation…" />;
  }
  const label = reading ? READING_LINES[lineIndex] : 'Getting ready to read…';
  return <ProtoProgressBar value={state.progress.value} label={label} />;
}

export default function ScanTextSheet({ open, file, onRetake, onClose, onCreate }: ScanTextSheetProps) {
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const retakeInputRef = useRef<HTMLInputElement>(null);
  const [defaultTranslation] = useState(() => getEffectiveDefaultTranslation());
  const state = useScanText(file, defaultTranslation);

  const photoUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  // ── Review choices ───────────────────────────────────────────────────────────
  const [textDraft, setTextDraft] = useState('');
  const [overrides, setOverrides] = useState<Map<string, string>>(() => new Map());
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<'text' | 'passage'>('text');
  const [passageTranslation, setPassageTranslation] = useState<string | null>(null);
  const [viewingPage, setViewingPage] = useState(false);
  const [editingText, setEditingText] = useState(false);

  useEffect(() => {
    if (state.phase !== 'review' || !state.scan) return;
    setTextDraft(state.scan.text);
    setOverrides(new Map());
    setExcluded(new Set());
    setEditingText(false);
    const match = state.passage.match;
    setPassageTranslation(match?.translation ?? null);
    setMode(match && match.precision >= PASSAGE_PAGE_PRECISION ? 'passage' : 'text');
  }, [state.phase, state.scan, state.passage]);

  // The draft is re-read as it is edited, so fixing a misread reference pills it.
  const draftScan = useMemo(() => findScriptureInOcrText(textDraft), [textDraft]);
  const passageOptions: IdentifiedPassage[] = useMemo(
    () => (state.passage.match ? [state.passage.match, ...state.passage.alternatives] : []),
    [state.passage],
  );
  const passage = passageOptions.find((p) => p.translation === passageTranslation) ?? passageOptions[0] ?? null;

  const choices = { defaultTranslation, translationOverrides: overrides, excluded };
  const pilledCount = draftScan.references.filter((r) => !excluded.has(r.key)).length;
  const canCreate = state.phase === 'review' && (mode === 'passage' ? Boolean(passage) : textDraft.trim().length > 0);

  const create = () => {
    if (!canCreate) return;
    const contentHtml =
      mode === 'passage' && passage
        ? buildScannedPassageNoteHtml(passage)
        : buildScannedTextNoteHtml(draftScan.paragraphs, choices);
    onCreate({ contentHtml });
  };

  // ── Presentation (sheet on a phone, centred card elsewhere) ─────────────────
  const { asSheet } = useSheetPresentation();
  const showPopover = !asSheet && mounted;
  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    { enabled: showPopover, strategy: 'centered', topVhFraction: 0.08, fallbackWidth: 440, fallbackHeight: 620 },
    [state.phase, mode, draftScan.references.length],
  );
  // The translation menus portal out of the card; a press in one is not a press outside.
  useDismissOnOutside(cardRef, onClose, open && !asSheet && !viewingPage, {
    ignoreSelector: '.proto-select-menu__popover, .proto-scan-viewer',
  });

  const reviewing = state.phase === 'review';
  /*
   * What the scan guessed at, from the first read. Kept by reference rather than re-derived
   * from the draft: editing the text re-reads it with nothing left to repair, which would
   * clear every flag. A flag goes when its reference changes — that is, when it was fixed.
   */
  const guessedAt = useMemo(
    () => new Map((state.scan?.references ?? []).filter((r) => r.readAs).map((r) => [r.key, r.readAs!] as const)),
    [state.scan],
  );
  const stripReferences =
    reviewing && mode === 'text'
      ? draftScan.references.map((ref) => ({
          key: ref.key,
          text: ref.text,
          translation: resolveScanTranslation(ref.key, ref.translation, choices),
          source: (overrides.has(ref.key) ? 'chosen' : ref.translation ? 'printed' : 'default') as
            | 'chosen'
            | 'printed'
            | 'default',
          occurrences: ref.occurrences,
          excluded: excluded.has(ref.key),
          readAs: guessedAt.get(ref.key) ?? null,
        }))
      : [];
  const stripPassage =
    reviewing && mode === 'passage' && passage
      ? {
          reference: passage.reference,
          translation: passage.translation,
          text: passage.text,
          ambiguous: state.passage.ambiguous,
          options: passageOptions.map((p) => ({
            value: p.translation,
            label: getTranslationAbbreviationDisplay(p.translation),
          })),
        }
      : null;
  const scriptureCount = stripPassage ? 1 : stripReferences.length;
  const toCheck = stripReferences.filter((r) => r.readAs && !r.excluded).length;
  const flaggedKeys = new Set(stripReferences.filter((r) => r.readAs).map((r) => r.key));

  const scriptureHint = !reviewing
    ? 'Reading…'
    : mode === 'passage'
      ? 'Recognized'
      : `${scriptureCount} found${toCheck > 0 ? ` · ${toCheck} to check` : scriptureCount > 0 ? ' · all read cleanly' : ''}`;

  const content = (
    <div className="proto-scan">
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <span className="proto-study-thread-popover__title">Scan a page</span>
        </div>
        <button type="button" className="proto-side-panel__action-btn" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <div className="proto-scan__body">

        {state.phase === 'failed' ? (
          <div className="proto-scan__intro">
            <h2 className="proto-scan__title">Nothing to read yet</h2>
            <p className="proto-scan__lede">{state.error}</p>
          </div>
        ) : null}

        {/* The page first — it is what you photographed, and the Scripture below was read off
            it. Separate sections because correcting the scan and checking the verses are
            different jobs. */}
        <section className="proto-scan__section" aria-labelledby="proto-scan-page-head">
          <div className="proto-scan__field-head">
            <h3 className="proto-scan__field-label" id="proto-scan-page-head">
              <span className="proto-scan__step">1</span>The page
            </h3>
            {reviewing && mode === 'text' ? (
              <button
                type="button"
                className="proto-scan__edit-toggle"
                onClick={() => setEditingText((v) => !v)}
                aria-pressed={editingText}
              >
                {editingText ? 'Done' : 'Edit text'}
              </button>
            ) : null}
          </div>
          <div className="proto-scan__page">
            <button
              type="button"
              className={`proto-scan-photo${state.phase === 'reading' ? ' proto-scan-photo--reading' : ''}`}
              onClick={() => setViewingPage(true)}
              disabled={!photoUrl}
              aria-label="See the whole page"
              title="See the whole page"
            >
              {photoUrl ? <img src={photoUrl} alt="" /> : null}
              <span className="proto-scan-photo__sweep" aria-hidden />
              <span className="proto-scan-photo__expand" aria-hidden>
                <Icon name="up-right-and-down-left-from-center" size={9} />
              </span>
            </button>
            <div className="proto-scan__page-body">
              {state.phase === 'reading' || state.phase === 'matching' ? (
                <div className="proto-scan__status" aria-live="polite">
                  <ReadingStatus state={state} />
                </div>
              ) : null}
              {reviewing && mode === 'text' && editingText ? (
                <textarea
                  id="proto-scan-text"
                  aria-labelledby="proto-scan-page-head"
                  className="proto-scan__text"
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                  rows={7}
                  spellCheck
                  autoFocus
                />
              ) : null}
              {reviewing && mode === 'text' && !editingText ? (
                <>
                  <ScanPageText paragraphs={draftScan.paragraphs} flagged={flaggedKeys} excluded={excluded} />
                  {/* What to do with it, said once: what a mark means, and where fixes go. */}
                  <p className="proto-scan__page-help">
                    {toCheck > 0 ? (
                      <>
                        <span className="proto-scan-pagetext__key proto-scan-pagetext__key--check" aria-hidden />
                        Underlined references were read with a guess. Compare them with the photo, and
                        fix any in Edit text.
                      </>
                    ) : (
                      <>Tap a reference to see its card. Fix any misread words in Edit text.</>
                    )}
                  </p>
                </>
              ) : null}
              {reviewing && mode === 'passage' && passage ? (
                <p className="proto-scan__page-note">
                  The note quotes our {getTranslationAbbreviationDisplay(passage.translation)} text, so nothing
                  misread carries over.
                </p>
              ) : null}
              {reviewing && passage ? (
                <button
                  type="button"
                  className="proto-scan__mode-switch"
                  onClick={() => setMode((m) => (m === 'passage' ? 'text' : 'passage'))}
                >
                  {mode === 'passage'
                    ? 'Keep the scanned words instead'
                    : `Quote ${passage.reference} from the ${getTranslationAbbreviationDisplay(passage.translation)} instead`}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {state.phase !== 'failed' ? (
          <section className="proto-scan__section" aria-labelledby="proto-scan-scripture-head">
            <div className="proto-scan__field-head">
              <h3 className="proto-scan__field-label" id="proto-scan-scripture-head">
                <span className="proto-scan__step">2</span>Scripture on this page
              </h3>
              {/* The count, where the cards are — not a second title over the sheet's own. */}
              <span className="proto-scan__field-hint" aria-live="polite">{scriptureHint}</span>
            </div>
            {/* One panel for the page's references, so they read as a set that came from it. */}
            <div className="proto-scan__group">
              {reviewing && scriptureCount === 0 ? (
                <p className="proto-scan__group-empty">No references found. The words below are kept as written.</p>
              ) : (
                <ScanStrip
                  placeholders={reviewing ? 0 : 2}
                  references={stripReferences}
                  passage={stripPassage}
                  translationOptions={TRANSLATION_OPTIONS}
                  onTranslationChange={(key, value) => setOverrides((prev) => new Map(prev).set(key, value))}
                  onToggleExcluded={(key) =>
                    setExcluded((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  onPassageTranslationChange={setPassageTranslation}
                  onSeePage={() => setViewingPage(true)}
                />
              )}
            </div>
          </section>
        ) : null}

      </div>

      {/* The sheet footer every other sheet uses: pinned under what scrolls, the primary on
          the right where the eye finishes, the quiet action across from it. */}
      <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked proto-scan__footer">
        {reviewing ? (
          <button type="button" className="proto-share-popover__primary" onClick={create} disabled={!canCreate}>
            Create note
          </button>
        ) : null}
        <button
          type="button"
          className="proto-sheet-quiet-action"
          onClick={() => retakeInputRef.current?.click()}
        >
          {state.phase === 'failed' || reviewing ? 'Retake' : 'Choose another photo'}
        </button>
        <input
          ref={retakeInputRef}
          type="file"
          accept={SCAN_TEXT_ACCEPT}
          hidden
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const next = event.target.files?.[0];
            event.target.value = '';
            if (next) onRetake(next);
          }}
        />
      </div>
      {viewingPage && photoUrl ? <ScanPageViewer photoUrl={photoUrl} onClose={() => setViewingPage(false)} /> : null}
    </div>
  );

  if (showPopover && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop exiting={exiting} onDismiss={onClose} aria-label="Close scan" />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label="Scan a page"
          className={portaledDialogShellClassName('proto-connect-note-popover proto-scan-popover', exiting)}
          style={{ position: 'fixed', top: position?.top ?? -9999, left: position?.left ?? -9999, zIndex: 6000 }}
        >
          <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-scan-sheet">{content}</div>
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open) return null;

  return (
    <Drawer.Root open={open} onOpenChange={(next) => (next || viewingPage ? undefined : onClose())}>
      <DrawerContent
        onOverlayClick={onClose}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-scan-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
