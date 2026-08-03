import { describe, expect, it } from 'vitest';
import {
  endsWithTagBoundary,
  isRawListPreviewWrite,
  isSuspiciousNoteShrink,
} from '../note-truncated-write-guard';

const CAP = 2000;

/** What `left(content, CAP)` produces: a byte-exact prefix, usually cut mid-tag. */
function listPreviewOf(stored: string): string {
  return stored.slice(0, CAP);
}

function body(chars: number): string {
  return `<p>${'a'.repeat(Math.max(0, chars - 7))}</p>`;
}

describe('isRawListPreviewWrite', () => {
  it('trips on a list preview written back over the full note', () => {
    const stored = body(6000);
    expect(isRawListPreviewWrite(listPreviewOf(stored), stored, CAP)).toBe(true);
  });

  it('ignores a body one character short of the cap', () => {
    const stored = body(6000);
    expect(isRawListPreviewWrite(stored.slice(0, CAP - 1), stored, CAP)).toBe(false);
  });

  it('ignores a body one character over the cap', () => {
    const stored = body(6000);
    expect(isRawListPreviewWrite(stored.slice(0, CAP + 1), stored, CAP)).toBe(false);
  });

  it('ignores a cap-length body that is not a prefix of the stored one', () => {
    const stored = body(6000);
    const edited = `<p>z${'a'.repeat(CAP - 4)}`;
    expect(edited.length).toBe(CAP);
    expect(isRawListPreviewWrite(edited, stored, CAP)).toBe(false);
  });

  it('ignores writes to a note that was never long enough to truncate', () => {
    const stored = body(CAP);
    expect(isRawListPreviewWrite(stored, stored, CAP)).toBe(false);
  });

  it('ignores a genuine edit that grows the note', () => {
    const stored = body(6000);
    expect(isRawListPreviewWrite(body(7000), stored, CAP)).toBe(false);
  });

  it('ignores a missing body — an omitted content field is not a write', () => {
    expect(isRawListPreviewWrite(undefined, body(6000), CAP)).toBe(false);
    expect(isRawListPreviewWrite(body(CAP), undefined, CAP)).toBe(false);
  });
});

describe('isSuspiciousNoteShrink', () => {
  it('flags a body that lost more than half its length', () => {
    expect(isSuspiciousNoteShrink(body(2000), body(9000))).toBe(true);
  });

  it('does not flag an ordinary trim', () => {
    expect(isSuspiciousNoteShrink(body(8000), body(9000))).toBe(false);
  });

  it('does not flag short notes, where a big percentage swing is normal editing', () => {
    expect(isSuspiciousNoteShrink(body(100), body(900))).toBe(false);
  });

  it('never flags growth', () => {
    expect(isSuspiciousNoteShrink(body(9000), body(4001))).toBe(false);
  });
});

describe('endsWithTagBoundary', () => {
  it('is true for a real editor body', () => {
    expect(endsWithTagBoundary('<p>hello</p>')).toBe(true);
    expect(endsWithTagBoundary('<p>hello</p>\n')).toBe(true);
  });

  it('is false for a body cut mid-tag, which is what left() produces', () => {
    expect(endsWithTagBoundary('<p>hello</p><p clas')).toBe(false);
    expect(endsWithTagBoundary('<p>hel')).toBe(false);
  });
});
