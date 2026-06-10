import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { NodeSelection } from '@tiptap/pm/state';
import {
  captureInlineImageInsertPos,
  clampInlineImageInsertPos,
  contentSyncWouldClobberInlineImage,
  insertInlineImageAtPos,
} from '../inline-image-insert';

const extensions = [
  StarterKit.configure({
    heading: false,
    link: false,
  }),
  Image.configure({ inline: false, allowBase64: false }),
];

describe('captureInlineImageInsertPos', () => {
  it('uses selection.from for text selection', () => {
    expect(captureInlineImageInsertPos({ from: 3, to: 3 })).toBe(3);
  });

  it('uses selection.to for NodeSelection on horizontalRule', () => {
    const editor = new Editor({
      extensions,
      content: '<p>a</p><hr><p>b</p>',
    });
    try {
      let hrPos = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'horizontalRule' && hrPos === -1) hrPos = pos;
      });
      const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, hrPos));
      editor.view.dispatch(tr);
      expect(captureInlineImageInsertPos(editor.state.selection)).toBe(hrPos + 1);
    } finally {
      editor.destroy();
    }
  });
});

describe('clampInlineImageInsertPos', () => {
  it('clamps negative positions to zero', () => {
    const editor = new Editor({ extensions, content: '<p>hi</p>' });
    try {
      expect(clampInlineImageInsertPos(editor.state.doc, -5)).toBe(0);
    } finally {
      editor.destroy();
    }
  });

  it('clamps positions beyond doc size', () => {
    const editor = new Editor({ extensions, content: '<p>hi</p>' });
    try {
      const max = editor.state.doc.content.size;
      expect(clampInlineImageInsertPos(editor.state.doc, max + 100)).toBe(max);
    } finally {
      editor.destroy();
    }
  });
});

describe('contentSyncWouldClobberInlineImage', () => {
  it('returns true when editor has img but content prop does not', () => {
    expect(
      contentSyncWouldClobberInlineImage(
        '<p>text</p><img src="https://example.com/x.jpg" alt="">',
        '<p>text</p>',
      ),
    ).toBe(true);
  });

  it('returns false when both have img', () => {
    const html = '<p>text</p><img src="https://example.com/x.jpg" alt="">';
    expect(contentSyncWouldClobberInlineImage(html, html)).toBe(false);
  });

  it('returns false when neither has img', () => {
    expect(contentSyncWouldClobberInlineImage('<p>text</p>', '<p>text</p>')).toBe(false);
  });
});

describe('insertInlineImageAtPos', () => {
  it('inserts img after async gap without focus', () => {
    const editor = new Editor({
      extensions,
      content: '<p>hello</p>',
    });
    try {
      editor.commands.setTextSelection(3);
      const insertPos = captureInlineImageInsertPos(editor.state.selection);
      const applied = insertInlineImageAtPos(editor, insertPos, 'https://example.com/photo.jpg');
      expect(applied).toBe(true);
      expect(editor.getHTML()).toContain('<img');
      expect(editor.getHTML()).toContain('https://example.com/photo.jpg');
    } finally {
      editor.destroy();
    }
  });
});

describe('async upload + insert flow', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://cdn.example.com/x.jpg' }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('survives await between position capture and insert', async () => {
    const editor = new Editor({
      extensions,
      content: '<p>hello</p>',
    });
    try {
      editor.commands.setTextSelection(3);
      const insertPos = captureInlineImageInsertPos(editor.state.selection);

      await new Promise((r) => setTimeout(r, 10));
      const res = await fetch('/api/notes/note_1/inline-image', { method: 'POST' });
      const data = (await res.json()) as { url: string };

      const clampedPos = clampInlineImageInsertPos(editor.state.doc, insertPos);
      const applied = insertInlineImageAtPos(editor, clampedPos, data.url);
      expect(applied).toBe(true);
      expect(editor.getHTML()).toContain('https://cdn.example.com/x.jpg');
    } finally {
      editor.destroy();
    }
  });
});

/**
 * Regression: isUploadingInlineImage must NOT be in the TiptapEditor focus/blur effect deps.
 * Toggling upload state re-ran that effect and called setIsEditorFocused(false) mid-upload.
 */
