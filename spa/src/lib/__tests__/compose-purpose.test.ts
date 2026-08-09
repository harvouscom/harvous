import { describe, expect, it } from 'vitest';
import { notePurposeModel } from '../compose-purpose';

describe('notePurposeModel', () => {
  it('says nothing for an ordinary note', () => {
    // The overwhelmingly common case, and the one that must stay silent — a
    // banner on every note would be chrome nobody asked for.
    expect(notePurposeModel({ composePurpose: null })).toBeNull();
    expect(
      notePurposeModel({ composePurpose: null, startedFromServiceTitle: '   ' }),
    ).toBeNull();
  });

  it('names the week a note was started for', () => {
    const purpose = notePurposeModel({
      composePurpose: null,
      startedFromServiceTitle: 'The Weight of Grace',
    });
    expect(purpose).toEqual({
      kind: 'service',
      label: 'Writing notes for The Weight of Grace',
      actionLabel: null,
    });
  });

  it('offers the save action only for a template', () => {
    // "Create a template" has no editor to open — the action is the bridge from
    // an ordinary note to being saved as one.
    const purpose = notePurposeModel({ composePurpose: 'template' });
    expect(purpose?.kind).toBe('template');
    expect(purpose?.actionLabel).toBe('Save as template');
  });

  it('lets the current intention beat where the note came from', () => {
    // The service is lineage; the template is what the author is doing now.
    const purpose = notePurposeModel({
      composePurpose: 'template',
      startedFromServiceTitle: 'The Weight of Grace',
    });
    expect(purpose?.kind).toBe('template');
  });

  it('goes silent once dismissed, whatever the reason it appeared', () => {
    // Dismissing means "this is just a note", and a note that argues back is
    // worse than one that never spoke.
    for (const input of [
      { composePurpose: 'template' as const },
      { composePurpose: null, startedFromServiceTitle: 'The Weight of Grace' },
    ]) {
      expect(notePurposeModel({ ...input, dismissed: true })).toBeNull();
    }
  });
});
