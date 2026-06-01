import React from 'react';

/**
 * CSS-in-JS styles for the NewNotePanel
 * These styles are injected into the component to ensure proper styling of TiptapEditor elements
 */
export default function NewNotePanelStyles() {
  return (
    <style>{`
      /* Heading styles for TiptapEditor in NewNotePanel - match editor styles */
      .new-note-panel .tiptap-content .ProseMirror h2 {
        font-size: 19px !important;
        font-weight: 600 !important;
        line-height: 1.3 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.75em !important;
        color: var(--color-deep-grey) !important;
        font-family: var(--font-sans) !important;
      }

      .new-note-panel .tiptap-content .ProseMirror h2:first-child {
        margin-top: 0 !important;
      }

      .new-note-panel .tiptap-content .ProseMirror h3 {
        font-size: 17px !important;
        font-weight: 600 !important;
        line-height: 1.35 !important;
        margin-top: 1.25em !important;
        margin-bottom: 0.625em !important;
        color: var(--color-deep-grey) !important;
        font-family: var(--font-sans) !important;
      }

      .new-note-panel .tiptap-content .ProseMirror h3:first-child {
        margin-top: 0 !important;
      }

      /* Horizontal rule styles for TiptapEditor in NewNotePanel */
      .new-note-panel .tiptap-content .ProseMirror hr {
        margin: 1.5em 0 !important;
        border: none !important;
        border-top: 1px solid #e5e5e5 !important;
        background: none !important;
        height: 1px !important;
        padding: 0 !important;
      }

      .new-note-panel .tiptap-content .ProseMirror hr:first-child {
        margin-top: 0 !important;
      }

      .new-note-panel .tiptap-content .ProseMirror hr:last-child {
        margin-bottom: 0 !important;
      }
    `}</style>
  );
}
