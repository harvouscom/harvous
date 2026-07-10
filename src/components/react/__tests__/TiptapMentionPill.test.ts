import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { MentionPill, mentionSpanIsValid } from '../TiptapMentionPill';
import { NoteLink } from '../TiptapNoteLink';
import { ScripturePill } from '../TiptapScripturePill';

const extensions = [Document, Paragraph, Text, MentionPill, NoteLink, ScripturePill];

function pillMarksAt(editor: Editor, pos: number): string[] {
  return editor.state.doc.resolve(pos).marks().map((m) => m.type.name);
}

describe('mentionSpanIsValid', () => {
  it('accepts a known kind with a non-empty id', () => {
    expect(mentionSpanIsValid('note', 'note_1')).toBe(true);
    expect(mentionSpanIsValid('thread', 'note_1')).toBe(true);
    expect(mentionSpanIsValid('folder', 'Sermon Notes')).toBe(true);
  });

  it('rejects unknown kinds, missing kind, or empty id', () => {
    expect(mentionSpanIsValid('user', 'id')).toBe(false);
    expect(mentionSpanIsValid(null, 'id')).toBe(false);
    expect(mentionSpanIsValid('note', '')).toBe(false);
    expect(mentionSpanIsValid('note', null)).toBe(false);
  });
});

describe('MentionPill mark config', () => {
  it('is non-inclusive and excludes all marks to prevent stickiness', () => {
    expect(MentionPill.config.inclusive).toBe(false);
    expect(MentionPill.config.excludes).toBe('_');
  });
});

describe('MentionPill parseHTML validation gate', () => {
  it('parses a valid mention span and preserves attrs through getHTML', () => {
    const html =
      '<p><span data-mention-kind="note" data-mention-id="note_42" ' +
      'data-mention-space-id="space_1">Romans Study</span></p>';
    const editor = new Editor({ extensions, content: html });
    try {
      const out = editor.getHTML();
      expect(out).toContain('data-mention-kind="note"');
      expect(out).toContain('data-mention-id="note_42"');
      expect(out).toContain('data-mention-space-id="space_1"');
      expect(out).toContain('class="mention-pill"');
    } finally {
      editor.destroy();
    }
  });

  it('degrades a corrupt mention span (unknown kind) to plain text', () => {
    const editor = new Editor({
      extensions,
      content: '<p><span data-mention-kind="user" data-mention-id="u_1">Someone</span></p>',
    });
    try {
      expect(editor.getHTML()).not.toContain('mention-pill');
      expect(editor.getHTML()).toContain('Someone');
    } finally {
      editor.destroy();
    }
  });

  it('degrades a mention span with no id to plain text', () => {
    const editor = new Editor({
      extensions,
      content: '<p><span data-mention-kind="note">Untitled</span></p>',
    });
    try {
      expect(editor.getHTML()).not.toContain('mention-pill');
    } finally {
      editor.destroy();
    }
  });

  it('does not hijack a scripture pill span (data-scripture-reference present)', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p><span data-scripture-reference="John 3:16" data-note-id="note_1" ' +
        'data-mention-kind="note" data-mention-id="note_1">John 3:16</span></p>',
    });
    try {
      let hasScripturePill = false;
      let hasMentionPill = false;
      editor.state.doc.descendants((node) => {
        if (node.marks.some((m) => m.type.name === 'scripturePill')) hasScripturePill = true;
        if (node.marks.some((m) => m.type.name === 'mentionPill')) hasMentionPill = true;
      });
      expect(hasScripturePill).toBe(true);
      expect(hasMentionPill).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it('does not hijack a plain NoteLink span (data-note-id, no mention attrs)', () => {
    const editor = new Editor({
      extensions,
      content: '<p><span data-note-id="note_1">See this note</span></p>',
    });
    try {
      let hasMentionPill = false;
      editor.state.doc.descendants((node) => {
        if (node.marks.some((m) => m.type.name === 'mentionPill')) hasMentionPill = true;
      });
      expect(hasMentionPill).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});

describe('insertMentionPill command', () => {
  it('replaces the @query range with a labeled pill and clears stored marks', () => {
    const editor = new Editor({ extensions, content: '<p>see @rom</p>' });
    try {
      const atPos = 5; // position of '@' — 1 (para open) + 'see '.length
      const caretPos = editor.state.doc.content.size - 1;
      editor.commands.insertMentionPill({
        kind: 'note',
        entityId: 'note_42',
        spaceId: 'space_1',
        label: 'Romans Study',
        range: { from: atPos, to: caretPos },
      });

      const html = editor.getHTML();
      expect(html).toContain('data-mention-kind="note"');
      expect(html).toContain('data-mention-id="note_42"');
      expect(html).toContain('Romans Study');
      expect(html).not.toContain('@rom');

      // Caret should sit just after the trailing spacer, outside the mark.
      const caret = editor.state.selection.from;
      expect(pillMarksAt(editor, caret)).not.toContain('mentionPill');
      expect(editor.state.storedMarks ?? []).toHaveLength(0);
    } finally {
      editor.destroy();
    }
  });
});

describe('MentionPill stickiness', () => {
  it('does not apply the pill mark to text typed after the pill', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p>see <span data-mention-kind="note" data-mention-id="note_1">Romans Study</span> </p>',
    });
    try {
      editor.commands.setTextSelection(editor.state.doc.content.size);
      editor.commands.insertContent('and more');

      let prosePilled = false;
      editor.state.doc.descendants((node) => {
        if (
          node.isText &&
          node.text?.includes('and more') &&
          node.marks.some((m) => m.type.name === 'mentionPill')
        ) {
          prosePilled = true;
        }
      });
      expect(prosePilled).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});
