import { describe, expect, it } from 'vitest';
import { shouldForcePrototypeNoteBodyHydrate } from '../prototype-note-editor-hydration';
import {
  shouldSkipPrototypeUnloadSave,
  isRedundantUnloadResend,
  UNLOAD_RESEND_SUPPRESSION_MS,
} from '../prototype-note-save-guard';

describe('shouldForcePrototypeNoteBodyHydrate', () => {
  it('hydrates prototype edit-note-content when editor is empty and prop has body', () => {
    expect(
      shouldForcePrototypeNoteBodyHydrate({
        editorChromeMode: 'prototypeNative',
        editorId: 'edit-note-content',
        editorIsEmpty: true,
        incomingContent: '<p>Romans 8</p>',
      }),
    ).toBe(true);
  });

  it('hydrates new-note-content the same way', () => {
    expect(
      shouldForcePrototypeNoteBodyHydrate({
        editorChromeMode: 'prototypeNative',
        editorId: 'new-note-content',
        editorIsEmpty: true,
        incomingContent: '<p>Hello</p>',
      }),
    ).toBe(true);
  });

  it('does not hydrate when editor already has content', () => {
    expect(
      shouldForcePrototypeNoteBodyHydrate({
        editorChromeMode: 'prototypeNative',
        editorId: 'edit-note-content',
        editorIsEmpty: false,
        incomingContent: '<p>Server copy</p>',
      }),
    ).toBe(false);
  });

  it('hydrates non-empty editor when preview→full upgrade is allowed', () => {
    expect(
      shouldForcePrototypeNoteBodyHydrate({
        editorChromeMode: 'prototypeNative',
        editorId: 'edit-note-content',
        editorIsEmpty: false,
        incomingContent: '<p>Full body after details</p>',
        allowPreviewToFullUpgrade: true,
      }),
    ).toBe(true);
  });

  it('does not preview→full upgrade when incoming body is empty', () => {
    expect(
      shouldForcePrototypeNoteBodyHydrate({
        editorChromeMode: 'prototypeNative',
        editorId: 'edit-note-content',
        editorIsEmpty: false,
        incomingContent: '<p></p>',
        allowPreviewToFullUpgrade: true,
      }),
    ).toBe(false);
  });

  it('does not hydrate classic chrome', () => {
    expect(
      shouldForcePrototypeNoteBodyHydrate({
        editorChromeMode: 'classic',
        editorId: 'edit-note-content',
        editorIsEmpty: true,
        incomingContent: '<p>Body</p>',
      }),
    ).toBe(false);
  });
});

describe('shouldSkipPrototypeUnloadSave', () => {
  it('skips empty unload save when server content is non-empty', () => {
    expect(
      shouldSkipPrototypeUnloadSave({
        contentToSave: '<p></p>',
        lastSavedContent: null,
        serverContent: '<p>Saved body</p>',
        draftContent: null,
      }),
    ).toBe(true);
  });

  it('skips empty unload save when last saved body was non-empty', () => {
    expect(
      shouldSkipPrototypeUnloadSave({
        contentToSave: '<p></p>',
        lastSavedContent: '<p>Earlier save</p>',
        serverContent: null,
        draftContent: null,
      }),
    ).toBe(true);
  });

  it('skips empty unload save when local draft has body', () => {
    expect(
      shouldSkipPrototypeUnloadSave({
        contentToSave: '<p></p>',
        lastSavedContent: null,
        serverContent: null,
        draftContent: '<p>Draft body</p>',
      }),
    ).toBe(true);
  });

  it('allows empty unload save when every known copy is empty', () => {
    expect(
      shouldSkipPrototypeUnloadSave({
        contentToSave: '<p></p>',
        lastSavedContent: '<p></p>',
        serverContent: '',
        draftContent: null,
      }),
    ).toBe(false);
  });

  it('allows non-empty unload save through', () => {
    expect(
      shouldSkipPrototypeUnloadSave({
        contentToSave: '<p>Fresh typing</p>',
        lastSavedContent: '<p>Old</p>',
        serverContent: '<p>Old</p>',
        draftContent: null,
      }),
    ).toBe(false);
  });
});

describe('isRedundantUnloadResend', () => {
  const base = {
    noteId: 'note_1',
    title: 'Witness',
    content: '<p>body</p>',
    collectionKey: 'Sermons||0|0',
  };
  const sent = { ...base, at: 1_000 };

  it('is false when nothing has been sent yet', () => {
    expect(isRedundantUnloadResend(null, base, 1_000)).toBe(false);
  });

  it('suppresses an identical resend inside the window — the app-switch burst', () => {
    expect(isRedundantUnloadResend(sent, base, 1_000 + 3_000)).toBe(true);
  });

  it('allows the resend once the window has passed', () => {
    expect(isRedundantUnloadResend(sent, base, 1_000 + UNLOAD_RESEND_SUPPRESSION_MS)).toBe(false);
  });

  it('never suppresses a payload the user actually changed', () => {
    expect(isRedundantUnloadResend(sent, { ...base, content: '<p>body more</p>' }, 1_500)).toBe(false);
    expect(isRedundantUnloadResend(sent, { ...base, title: 'Witness 2' }, 1_500)).toBe(false);
    expect(isRedundantUnloadResend(sent, { ...base, collectionKey: 'Other||0|0' }, 1_500)).toBe(false);
  });

  it('does not carry across notes — a different note is always its own write', () => {
    expect(isRedundantUnloadResend(sent, { ...base, noteId: 'note_2' }, 1_500)).toBe(false);
  });
});
