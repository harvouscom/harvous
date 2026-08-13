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

  it('names the occasion rather than repeating the sermon title', () => {
    /*
      The note's own title is derived from the same sermon, so echoing it here put the
      banner directly above a heading of the same words. Which occasion the notes are
      for is the part the reader cannot already see — and "writing notes" is what the
      whole surface is, so it says only the occasion.
    */
    const purpose = notePurposeModel({
      composePurpose: null,
      startedFromServiceTitle: 'The Weight of Grace',
    });
    expect(purpose).toEqual({
      kind: 'service',
      label: "This week's sermon",
      actionLabel: null,
    });
    expect(purpose?.label).not.toContain('The Weight of Grace');
  });

  it('does not claim "this week" for a note started in a room', () => {
    // "Coming up" is the room's *next* sermon, which can be weeks out — the one place
    // the Home wording would have been a small lie.
    const purpose = notePurposeModel({
      composePurpose: null,
      startedFromServiceTitle: 'The Weight of Grace',
      startedInChurchSpace: true,
    });
    expect(purpose?.label).toBe('The next sermon');
  });

  it('still says nothing when there was no service to start from', () => {
    // The space a note lives in is not itself a reason to show the banner.
    expect(
      notePurposeModel({ composePurpose: null, startedInChurchSpace: true }),
    ).toBeNull();
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

describe('notePurposeModel reading context', () => {
  const sermon = { composePurpose: null, startedFromServiceTitle: 'The Weight of Grace' };

  it('names the sermon when read where the note was started', () => {
    expect(notePurposeModel({ ...sermon, readingInStartedContext: true })?.kind).toBe('service');
  });

  it('stays silent when the note is being read through a different room', () => {
    // The bug: startedFromServiceId/Title is a permanent column that nothing clears when a
    // note is filed into a study, so a note that began as sermon notes announced that sermon
    // inside every space it was ever added to — "adding notes to shared space study creates
    // this wrong header context of relating to sermon".
    expect(notePurposeModel({ ...sermon, readingInStartedContext: false })).toBeNull();
  });

  it('treats an unstated reading context as in-context', () => {
    // Callers that don't know must behave as they did before rather than lose the banner.
    expect(notePurposeModel(sermon)?.kind).toBe('service');
    expect(notePurposeModel({ ...sermon, readingInStartedContext: undefined })?.kind).toBe('service');
  });

  it('still lets a template beat an in-context sermon', () => {
    const purpose = notePurposeModel({
      ...sermon,
      composePurpose: 'template',
      readingInStartedContext: true,
    });
    expect(purpose?.kind).toBe('template');
  });
});
