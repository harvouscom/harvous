import { afterEach, describe, expect, it } from 'vitest';
import {
  isPrototypeInspectorNode,
  isPrototypeNoteEditorFocused,
  isPrototypeNoteSessionFocused,
} from '../prototype-editor-focused';

describe('prototype-editor-focused', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('detects ProseMirror editor focus', () => {
    document.body.innerHTML = `<div class="ProseMirror" contenteditable="true" tabindex="0"></div>`;
    const el = document.querySelector('.ProseMirror') as HTMLElement;
    el.focus();
    expect(isPrototypeNoteEditorFocused()).toBe(true);
    expect(isPrototypeNoteSessionFocused()).toBe(true);
  });

  it('detects inspector focus as session (not editor)', () => {
    document.body.innerHTML = `
      <div class="proto-inspector-desktop">
        <div class="proto-inspector">
          <input id="name" type="text" />
        </div>
      </div>
    `;
    const input = document.getElementById('name') as HTMLInputElement;
    input.focus();
    expect(isPrototypeNoteEditorFocused()).toBe(false);
    expect(isPrototypeInspectorNode(input)).toBe(true);
    expect(isPrototypeNoteSessionFocused()).toBe(true);
  });

  it('detects mobile inspector panel focus', () => {
    document.body.innerHTML = `
      <div class="proto-inspector-mobile-panel">
        <button id="save" type="button">Save</button>
      </div>
    `;
    const btn = document.getElementById('save') as HTMLButtonElement;
    btn.focus();
    expect(isPrototypeInspectorNode(btn)).toBe(true);
    expect(isPrototypeNoteSessionFocused()).toBe(true);
  });

  it('returns false when focus is elsewhere', () => {
    document.body.innerHTML = `<button id="other" type="button">Other</button>`;
    const btn = document.getElementById('other') as HTMLButtonElement;
    btn.focus();
    expect(isPrototypeNoteEditorFocused()).toBe(false);
    expect(isPrototypeInspectorNode(btn)).toBe(false);
    expect(isPrototypeNoteSessionFocused()).toBe(false);
  });
});
