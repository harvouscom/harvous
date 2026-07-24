import { describe, expect, it } from 'vitest';
import {
  deletedSpaceDaysRemaining,
  deletedSpacesSectionState,
  resolveSharedItemLeadingMeta,
} from '../PrototypeSharingPage';

describe('resolveSharedItemLeadingMeta', () => {
  it('maps note shares to the note-sticky icon', () => {
    expect(resolveSharedItemLeadingMeta('note')).toEqual({
      icon: 'note-sticky',
      label: 'Note',
    });
  });

  it('maps thread and space kinds for future sharing cards', () => {
    expect(resolveSharedItemLeadingMeta('thread').icon).toBe('layer-group');
    expect(resolveSharedItemLeadingMeta('space').icon).toBe('user-group');
  });
});

describe('recently deleted sharing settings state', () => {
  it('shows loading, retryable error, and row states but hides an empty successful section', () => {
    expect(deletedSpacesSectionState({ isLoading: true, isError: false, rowCount: 0 })).toBe('loading');
    expect(deletedSpacesSectionState({ isLoading: false, isError: true, rowCount: 0 })).toBe('error');
    expect(deletedSpacesSectionState({ isLoading: false, isError: false, rowCount: 1 })).toBe('rows');
    expect(deletedSpacesSectionState({ isLoading: false, isError: false, rowCount: 0 })).toBe('hidden');
  });

  it('rounds recovery time up to user-facing days remaining', () => {
    const now = Date.parse('2026-07-09T12:00:00.000Z');
    expect(deletedSpaceDaysRemaining('2026-07-10T12:00:00.000Z', now)).toBe(1);
    expect(deletedSpaceDaysRemaining('2026-07-10T12:00:00.001Z', now)).toBe(2);
    expect(deletedSpaceDaysRemaining('2026-07-08T12:00:00.000Z', now)).toBe(0);
  });
});
