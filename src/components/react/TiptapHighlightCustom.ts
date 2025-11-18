import Highlight from '@tiptap/extension-highlight';
import { Plugin, PluginKey } from 'prosemirror-state';

/**
 * Custom Highlight extension that prevents highlight from being applied
 * to text right after a scripture pill
 */
export const HighlightCustom = Highlight.extend({
  addCommands() {
    const parentCommands = this.parent?.() || {};
    return {
      ...parentCommands,
      setHighlight: () => ({ state, dispatch, chain }) => {
        // Check if cursor is after a pill before setting highlight
        const { selection } = state;
        const { from } = selection;
        
        if (from > 0 && from === selection.to) {
          try {
            const prevPos = from - 1;
            const $prev = state.doc.resolve(prevPos);
            const prevMarks = $prev.marks();
            const hasPill = prevMarks.some((m: any) => m.type.name === 'scripturePill');
            
            if (hasPill) {
              // Don't allow highlight to be set when cursor is after a pill
              // Clear stored marks and return false
              if (dispatch) {
                const tr = state.tr.setStoredMarks(
                  (state.storedMarks || []).filter((m: any) => m.type.name !== 'highlight')
                );
                dispatch(tr);
              }
              return false;
            }
          } catch (e) {
            // If check fails, allow normal behavior
          }
        }
        
        // Use parent's setHighlight - since we extend Highlight, just toggle the mark
        return chain().toggleMark('highlight').run();
      },
      toggleHighlight: () => ({ state, dispatch, chain }) => {
        // Check if cursor is after a pill before toggling highlight
        const { selection } = state;
        const { from } = selection;
        
        if (from > 0 && from === selection.to) {
          try {
            const prevPos = from - 1;
            const $prev = state.doc.resolve(prevPos);
            const prevMarks = $prev.marks();
            const hasPill = prevMarks.some((m: any) => m.type.name === 'scripturePill');
            
            if (hasPill) {
              // Don't allow highlight to be toggled when cursor is after a pill
              // Clear stored marks and return false
              if (dispatch) {
                const tr = state.tr.setStoredMarks(
                  (state.storedMarks || []).filter((m: any) => m.type.name !== 'highlight')
                );
                dispatch(tr);
              }
              return false;
            }
          } catch (e) {
            // If check fails, allow normal behavior
          }
        }
        
        // Use parent's toggleHighlight
        return chain().toggleMark('highlight').run();
      },
    };
  },
  addProseMirrorPlugins() {
    // Simplified - main mark removal is handled by ScripturePill plugin
    // This just prevents highlight from being toggled/applied when cursor is after a pill
    return [
      ...(this.parent?.() || []),
    ];
  },
});

