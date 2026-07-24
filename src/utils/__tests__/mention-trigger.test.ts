import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { findMentionTrigger } from '../mention-trigger';

const extensions = [Document, Paragraph, Text];

function editorWithCaretAtEnd(content: string): Editor {
  const editor = new Editor({ extensions, content });
  editor.commands.setTextSelection(editor.state.doc.content.size);
  return editor;
}

describe('findMentionTrigger', () => {
  it('triggers on @ at the start of a block', () => {
    const editor = editorWithCaretAtEnd('<p>@rom</p>');
    try {
      const trigger = findMentionTrigger(editor.state);
      expect(trigger).not.toBeNull();
      expect(trigger?.query).toBe('rom');
    } finally {
      editor.destroy();
    }
  });

  it('triggers on @ after a space', () => {
    const editor = editorWithCaretAtEnd('<p>see @rom</p>');
    try {
      const trigger = findMentionTrigger(editor.state);
      expect(trigger).not.toBeNull();
      expect(trigger?.query).toBe('rom');
    } finally {
      editor.destroy();
    }
  });

  it('does not trigger mid-word (e.g. an email address)', () => {
    const editor = editorWithCaretAtEnd('<p>a@b.com</p>');
    try {
      expect(findMentionTrigger(editor.state)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('returns an empty query for a bare trailing @', () => {
    const editor = editorWithCaretAtEnd('<p>notes @</p>');
    try {
      const trigger = findMentionTrigger(editor.state);
      expect(trigger).not.toBeNull();
      expect(trigger?.query).toBe('');
    } finally {
      editor.destroy();
    }
  });

  it('stops triggering once a space follows the @query', () => {
    const editor = editorWithCaretAtEnd('<p>@rom other</p>');
    try {
      expect(findMentionTrigger(editor.state)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('does not trigger on a non-collapsed selection', () => {
    const editor = new Editor({ extensions, content: '<p>@rom</p>' });
    try {
      editor.commands.setTextSelection({ from: 1, to: 3 });
      expect(findMentionTrigger(editor.state)).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});
