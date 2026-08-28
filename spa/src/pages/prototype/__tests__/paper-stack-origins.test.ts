import { describe, expect, it } from 'vitest';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import {
  buildNoteDockOrigin,
  buildRecallCardStackOrigin,
  buildRevisitCardStackOrigin,
  morphFromIfStillPlaced,
  noteDockReturnSearch,
} from '../paper-stack-origins';

describe('buildRecallCardStackOrigin', () => {
  const card = (kind: string, extra: Record<string, unknown> = {}) => ({
    kind,
    eyebrow: 'A highlight to revisit',
    title: 'Grace upon grace',
    meta: '3d ago',
    iconName: 'highlighter',
    ...extra,
  });

  it('stacks every kind that takes you off the shelf', () => {
    const leaves = [
      'revisitNote',
      'highlight',
      'annotateHighlight',
      'referenceWord',
      // Generative too: a blank draft has no context of its own, so the card that asked
      // for it is the only thing that says why the page is open.
      'continueBook',
      'studyPerson',
      'reflection',
      // The reported dead end — classed generative, but it usually opens a note you have.
      'crossrefGap',
    ];
    for (const kind of leaves) {
      const origin = buildRecallCardStackOrigin(card(kind));
      expect(origin, kind).not.toBeNull();
      expect(origin?.kind).toBe('homeCard');
      expect(origin?.cardKind).toBe(kind);
    }
  });

  it('carries the suggestion so the edge can answer it, and omits it when there is no row', () => {
    expect(buildRecallCardStackOrigin(card('highlight', { id: 'hl:7' }))?.suggestion).toEqual({
      id: 'hl:7',
      kind: 'highlight',
    });
    expect(buildRecallCardStackOrigin(card('highlight'))?.suggestion).toBeUndefined();
  });

  it('gives an annotate card an edge that names the ask, not the category', () => {
    // The edge over the note is the only thing on screen saying why the caret is sitting in a
    // highlight's note field. It reads the eyebrow, so the eyebrow has to be the ask.
    const origin = buildRecallCardStackOrigin(
      card('annotateHighlight', {
        id: 'annotate:st_1',
        eyebrow: 'Add a thought',
        meta: 'Worth a quick reflection',
        iconName: 'pen-to-square',
      }),
    );
    expect(origin?.suggestion).toEqual({ id: 'annotate:st_1', kind: 'annotateHighlight' });
    expect(origin?.label).toBe('Add a thought');
    expect(origin?.base).toMatchObject({
      eyebrow: 'Add a thought',
      title: 'Grace upon grace',
      meta: 'Worth a quick reflection',
    });
  });

  it('does not stack sidebar-layer kinds — nothing is put over anything', () => {
    for (const kind of ['arc', 'subject', 'crossref', 'connectNotes']) {
      expect(buildRecallCardStackOrigin(card(kind)), kind).toBeNull();
    }
  });

  it('stacks a passage card, which now opens the reader rather than a sidebar pane', () => {
    // It was excluded while it opened a standalone passage pane on Home. That pane is gone;
    // the card navigates into the main pane like any other, and was the only kind that could
    // move you somewhere and leave nothing on screen saying why.
    const origin = buildRecallCardStackOrigin(card('passage'));

    expect(origin).not.toBeNull();
    expect(origin?.cardKind).toBe('passage');
  });

  it('puts the card eyebrow on the edge and restates the card underneath', () => {
    const origin = buildRecallCardStackOrigin(card('revisitNote'));

    expect(origin?.label).toBe('A highlight to revisit');
    expect(origin?.icon).toBe('highlighter');
    expect(origin?.base).toEqual({
      type: 'originCard',
      eyebrow: 'A highlight to revisit',
      title: 'Grace upon grace',
      meta: '3d ago',
      icon: 'highlighter',
    });
  });

  it('falls back to the kind label when the card has no eyebrow', () => {
    const origin = buildRecallCardStackOrigin(card('revisitNote', { eyebrow: '', title: '' }));

    expect(origin?.label).toBe('Revisit note');
    expect(origin?.base.type === 'originCard' && origin.base.title).toBe('Revisit note');
  });

  it('returns to Home', () => {
    expect(buildRecallCardStackOrigin(card('revisitNote'))?.returnTo.to).toBe(prototypeHomeRouteTo());
  });
});

describe('buildRevisitCardStackOrigin', () => {
  it('names the card and returns to Home', () => {
    const origin = buildRevisitCardStackOrigin({ title: 'The vine', meta: '5d ago' });

    expect(origin.kind).toBe('homeCard');
    expect(origin.cardKind).toBe('revisit');
    expect(origin.label).toBe('Worth another look');
    expect(origin.returnTo.to).toBe(prototypeHomeRouteTo());
    expect(origin.base).toMatchObject({ title: 'The vine', meta: '5d ago' });
  });

  it('shows Untitled rather than an empty title', () => {
    expect(buildRevisitCardStackOrigin({ title: '' }).base).toMatchObject({ title: 'Untitled' });
  });
});

describe('buildNoteDockOrigin', () => {
  const input = {
    noteId: 'note_1786723674651',
    noteTitle: 'Nothing can separate',
    reference: 'Romans 8:28',
    translation: 'NLT',
    spaceId: 'space_1',
  };

  it('puts the note title on the edge and the anchor underneath', () => {
    const origin = buildNoteDockOrigin(input);

    expect(origin.kind).toBe('noteDock');
    expect(origin.label).toBe('Nothing can separate');
    expect(origin.icon).toBe('note-sticky');
    expect(origin.base).toEqual({
      type: 'originCard',
      title: 'Nothing can separate',
      meta: 'Romans 8:28 · NLT',
      icon: 'note-sticky',
    });
  });

  it('returns to the note with the dock reopened at the anchor, and no nonce stored', () => {
    const origin = buildNoteDockOrigin(input);

    expect(origin.returnTo.to).toBe(prototypeNoteRouteTo());
    expect(origin.returnTo.params?.noteId).toBeTruthy();
    expect(origin.returnTo.search).toMatchObject({
      scriptureRef: 'Romans 8:28',
      scriptureTranslation: 'NLT',
      space: 'space_1',
    });
    expect(origin.returnTo.search?.dockReq).toBeUndefined();
  });

  // The same word note rows, search and the mention picker use, so the edge does not
  // invent a second name for the state of having no title yet.
  it('calls an untitled note what the rest of the app calls it', () => {
    expect(buildNoteDockOrigin({ ...input, noteTitle: '' }).label).toBe('New Note');
  });
});

describe('noteDockReturnSearch', () => {
  it('mints a fresh dock nonce every collapse, on top of the frozen returnTo', () => {
    const origin = buildNoteDockOrigin({
      noteId: 'note_1',
      noteTitle: 'x',
      reference: 'John 15:5',
      translation: 'ESV',
    });

    const first = noteDockReturnSearch(origin, 1000);
    const second = noteDockReturnSearch(origin, 2000);

    expect(first.dockReq).toBe('1000');
    expect(second.dockReq).toBe('2000');
    expect(first.scriptureRef).toBe('John 15:5');
    // The origin itself is untouched — the anchor rule depends on it staying frozen.
    expect(origin.returnTo.search?.dockReq).toBeUndefined();
  });
});

describe('morphFromIfStillPlaced', () => {
  const placement = '14|972|780|';
  const rect = { top: 400, left: 300, width: 720, height: 240, dockPlacement: placement };

  it('keeps the rect while the dock band is where it was', () => {
    expect(morphFromIfStillPlaced(rect, placement)).toBe(rect);
  });

  /* Each of these moves the dock card: the sidebar collapsing or being dragged (left/width),
     the window resizing (width/bottom), the inspector docking (the flag — its reserve is
     padding on the slot, so it does not show in the band's own rect). */
  it('drops it once the band has moved', () => {
    expect(morphFromIfStillPlaced(rect, '92|894|780|')).toBeUndefined();
    expect(morphFromIfStillPlaced(rect, '14|972|640|')).toBeUndefined();
    expect(morphFromIfStillPlaced(rect, '14|972|780|inspector')).toBeUndefined();
  });

  /*
   * The regression this rule had at first: it compared the shell's whole class list, and the
   * note route carries `--note-chrome` while the reader does not. Expanding from a note and
   * collapsing back could therefore never match, so the morph was suppressed on every single
   * collapse — the guard silently disabled the thing it was guarding. Route chrome is not
   * layout; only what moves the dock belongs in here.
   */
  it('does not care which route is on screen', () => {
    expect(morphFromIfStillPlaced(rect, placement)).toBe(rect);
  });

  it('declines to animate onto a rect it cannot check', () => {
    expect(morphFromIfStillPlaced(rect, null)).toBeUndefined();
  });

  it('passes through the no-morph case', () => {
    expect(morphFromIfStillPlaced(undefined, placement)).toBeUndefined();
  });
});
