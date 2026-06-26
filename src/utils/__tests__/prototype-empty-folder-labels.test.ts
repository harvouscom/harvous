import { describe, expect, it } from 'vitest';
import {
  addPrototypeEmptyFolderLabel,
  isReservedPrototypeFolderLabel,
  parsePrototypeEmptyFolderLabels,
  removePrototypeEmptyFolderLabel,
} from '../../../server/utils/prototype-empty-folder-labels';

describe('prototype-empty-folder-labels', () => {
  it('rejects reserved folder names', () => {
    expect(isReservedPrototypeFolderLabel('My Pile')).toBe(true);
    expect(isReservedPrototypeFolderLabel('Unsorted')).toBe(true);
    expect(isReservedPrototypeFolderLabel('Romans')).toBe(false);
  });

  it('parses and serializes label arrays', () => {
    const labels = parsePrototypeEmptyFolderLabels(JSON.stringify(['Romans', 'Epistles', 'Romans']));
    expect(labels).toEqual(['Romans', 'Epistles']);
  });

  it('adds and removes labels case-insensitively', () => {
    const next = addPrototypeEmptyFolderLabel(['Paul'], 'romans');
    expect(next).toEqual(['Paul', 'romans']);
    expect(removePrototypeEmptyFolderLabel(next, 'ROMANS')).toEqual(['Paul']);
  });
});
