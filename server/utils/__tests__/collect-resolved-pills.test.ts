/**
 * Every pill in a note reaches the passage index, not just the first one.
 *
 * The bug this guards: `ScriptureMetadata` is the passage-to-note index behind the Bible
 * reader's margin bars, and for a pill that is already resolved the ONLY thing that writes it
 * is the loop fed by `collectResolvedPills`. That map used to be keyed by the pill's note id
 * alone — but in pills-only mode every pill in a note carries the PARENT note's id, so a note
 * citing five passages collapsed to one entry and four of them were silently never indexed.
 *
 * Tested here rather than through `processScriptureReferences` because the collapse happens
 * before any database work: the map's shape IS the bug, and asserting on it needs no note,
 * no user and no connection.
 */
import { describe, expect, it } from 'vitest';
import { collectResolvedPills } from '../process-scripture-references';

const PARENT = 'note_parent_1';

/** A pill as the canonical transform writes it, once resolved. */
const pill = (reference: string, noteId = PARENT) =>
  `<span class="scripture-pill" data-scripture-reference="${reference}" data-note-id="${noteId}">${reference}</span>`;

const references = (content: string) =>
  [...collectResolvedPills(content).values()].map((p) => p.reference).sort();

describe('collectResolvedPills', () => {
  it('keeps every passage in a note whose pills all carry the parent id', () => {
    const html = `<p>${pill('John 3:16')} and ${pill('Romans 8:28')} and ${pill('Psalms 23:1')}</p>`;
    expect(references(html)).toEqual(['John 3:16', 'Psalms 23:1', 'Romans 8:28']);
  });

  it('still collapses the same passage cited twice in one note', () => {
    // Two pills, one passage — one row to write, so one entry.
    const html = `<p>${pill('John 3:16')} … later ${pill('John 3:16')}</p>`;
    expect(references(html)).toEqual(['John 3:16']);
  });

  it('collapses two spellings of the same passage', () => {
    // Normalized before keying, so "Ps 23:1" and "Psalms 23:1" are not two rows.
    const html = `<p>${pill('Ps 23:1')} and ${pill('Psalms 23:1')}</p>`;
    expect(references(html).length).toBe(1);
  });

  it('ignores pills that have not been resolved yet', () => {
    // Pending pills are the OTHER path's job — they go through pendingPills and are created,
    // not upserted. Picking them up here would race that.
    const html = `<p>${pill('John 3:16', 'pending')}${pill('Romans 8:28', 'null')}${pill('Acts 2:42')}</p>`;
    expect(references(html)).toEqual(['Acts 2:42']);
  });

  it('carries the note id each pill was found with, for the legacy child-note path', () => {
    const html = `<p>${pill('John 3:16', 'note_child_a')}${pill('Romans 8:28', 'note_child_b')}</p>`;
    const found = [...collectResolvedPills(html).values()];
    expect(found.map((p) => p.scriptureNoteId).sort()).toEqual(['note_child_a', 'note_child_b']);
  });

  it('finds pills however the attributes are ordered', () => {
    // Tiptap serializes attributes in varying order; both spellings are one pill, not two.
    const html =
      `<p><span data-note-id="${PARENT}" data-scripture-reference="John 3:16">John 3:16</span>` +
      `<span data-scripture-reference="Romans 8:28" data-note-id="${PARENT}">Romans 8:28</span></p>`;
    expect(references(html)).toEqual(['John 3:16', 'Romans 8:28']);
  });

  it('finds nothing in a body with no pills', () => {
    expect(collectResolvedPills('<p>Just words about John 3:16.</p>').size).toBe(0);
  });
});
