import { describe, expect, it } from 'vitest';
import { shouldForcePrototypeNoteBodyHydrate } from '../prototype-note-editor-hydration';
import { shouldSkipPrototypeUnloadSave } from '../prototype-note-save-guard';

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
