import { describe, expect, it } from 'vitest';
import { shouldAllowPrimaryFolderUpdate } from '../should-allow-primary-folder-update';

describe('shouldAllowPrimaryFolderUpdate', () => {
  it('allows update when title changes', () => {
    expect(shouldAllowPrimaryFolderUpdate('Old', 'New', 'body', 'body')).toBe(true);
  });

  it('allows update when previous body was empty', () => {
    expect(shouldAllowPrimaryFolderUpdate('', '', '', 'first words')).toBe(true);
  });

  it('allows update when a newline is added', () => {
    expect(shouldAllowPrimaryFolderUpdate('t', 't', 'line one', 'line one\nline two')).toBe(true);
  });

  it('allows update when sentence punctuation is added', () => {
    expect(shouldAllowPrimaryFolderUpdate('t', 't', 'Hello world', 'Hello world.')).toBe(true);
  });

  it('allows update after substantial body growth (120+ chars)', () => {
    const prev = 'a'.repeat(100);
    const next = prev + 'b'.repeat(120);
    expect(shouldAllowPrimaryFolderUpdate('t', 't', prev, next)).toBe(true);
  });

  it('blocks update during small incremental typing', () => {
    expect(shouldAllowPrimaryFolderUpdate('t', 't', 'Hello', 'Hello w')).toBe(false);
  });
});
