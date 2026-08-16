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

  it('does not stack sidebar-layer kinds — nothing is put over anything', () => {
    for (const kind of ['arc', 'subject', 'crossref', 'passage', 'connectNotes']) {
      expect(buildRecallCardStackOrigin(card(kind)), kind).toBeNull();
    }
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
  const layout = 'proto-shell proto-theme|inspector|1400|900';
  const rect = { top: 400, left: 300, width: 720, height: 240, layout };

  it('keeps the rect while the shell is arranged the way it was', () => {
    expect(morphFromIfStillPlaced(rect, layout)).toBe(rect);
  });

  /* Each of these moves the dock card: the inspector docking, the sidebar collapsing, the
     window being dragged. None of them can be caught by measuring, because at collapse time
     the dock is not mounted to measure. */
  it('drops it once the shell has been rearranged', () => {
    expect(morphFromIfStillPlaced(rect, 'proto-shell proto-theme||1400|900')).toBeUndefined();
    expect(
      morphFromIfStillPlaced(rect, 'proto-shell proto-theme proto-shell--sidebar-collapsed|inspector|1400|900'),
    ).toBeUndefined();
    expect(morphFromIfStillPlaced(rect, 'proto-shell proto-theme|inspector|1100|900')).toBeUndefined();
  });

  it('declines to animate onto a rect it cannot check', () => {
    expect(morphFromIfStillPlaced(rect, null)).toBeUndefined();
  });

  it('passes through the no-morph case', () => {
    expect(morphFromIfStillPlaced(undefined, layout)).toBeUndefined();
  });
});
