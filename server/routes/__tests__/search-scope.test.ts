import { describe, expect, it } from 'vitest';
import {
  classifySearchScope,
  sharedSearchRequiresActiveAccess,
  sharedThreadNoteSearchUsesCanonicalThreadId,
  sharedThreadSearchUsesViewerOwnership,
} from '../search';

describe('search scope predicates', () => {
  it('treats no space and My Home as authored global scope', () => {
    expect(classifySearchScope(null)).toBe('home');
    expect(classifySearchScope({ type: 'personal', title: 'My Home' })).toBe('home');
    expect(classifySearchScope({ type: 'personal', title: ' my home ' })).toBe('home');
  });

  it('keeps named personal spaces author-scoped', () => {
    expect(classifySearchScope({ type: 'personal', title: 'Romans' })).toBe('personal');
  });

  it('uses association scope for collaborative spaces', () => {
    expect(classifySearchScope({ type: 'shared', title: 'Study Group' })).toBe('shared');
    expect(classifySearchScope({ type: 'public', title: 'Easter' })).toBe('shared');
  });

  it('binds shared note and thread search to current access instead of thread ownership', () => {
    expect(sharedSearchRequiresActiveAccess('shared')).toBe(true);
    expect(sharedThreadSearchUsesViewerOwnership('shared')).toBe(false);
    expect(sharedThreadNoteSearchUsesCanonicalThreadId('shared')).toBe(false);
    expect(sharedThreadSearchUsesViewerOwnership('personal')).toBe(true);
  });
});
