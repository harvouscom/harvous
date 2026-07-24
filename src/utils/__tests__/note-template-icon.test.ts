import { describe, expect, it } from 'vitest';
import {
  hashNoteTemplateIconColor,
  isNoteTemplateIconColor,
  resolveNoteTemplateIconColor,
} from '../note-template-icon';

describe('note-template-icon', () => {
  it('accepts thread accent colors except paper', () => {
    expect(isNoteTemplateIconColor('blue')).toBe(true);
    expect(isNoteTemplateIconColor('paper')).toBe(false);
    expect(isNoteTemplateIconColor('nope')).toBe(false);
  });

  it('uses built-in colors for included templates', () => {
    expect(resolveNoteTemplateIconColor('soap')).toBe('blue');
    expect(resolveNoteTemplateIconColor('inductive')).toBe('orange');
    expect(resolveNoteTemplateIconColor('text')).toBe('purple');
  });

  it('prefers explicit iconColor over built-in / hash', () => {
    expect(resolveNoteTemplateIconColor('soap', 'pink')).toBe('pink');
  });

  it('hashes stored ids without a color', () => {
    const a = hashNoteTemplateIconColor('ntpl_abc');
    const b = hashNoteTemplateIconColor('ntpl_abc');
    expect(a).toBe(b);
    expect(isNoteTemplateIconColor(a)).toBe(true);
  });
});
