import Bold from '@tiptap/extension-bold';
import { Plugin, PluginKey } from 'prosemirror-state';

/**
 * Custom Bold extension that prevents bold from being applied
 * to text right after a scripture pill
 */
export const BoldCustom = Bold.extend({
  addCommands() {
    return {
      ...this.parent?.() || {},
      toggleBold: () => ({ state, dispatch, chain }) => {
        // Check if cursor is after a pill before toggling bold
        const { selection } = state;
        const { from } = selection;
        
        if (from > 0 && from === selection.to) {
          try {
            const prevPos = from - 1;
            const $prev = state.doc.resolve(prevPos);
            const prevMarks = $prev.marks();
            const hasPill = prevMarks.some((m: any) => m.type.name === 'scripturePill');
            
            if (hasPill) {
              // Don't allow bold to be toggled when cursor is after a pill
              // Clear stored marks and return false
              if (dispatch) {
                const tr = state.tr.setStoredMarks(
                  (state.storedMarks || []).filter((m: any) => m.type.name !== 'bold')
                );
                dispatch(tr);
              }
              return false;
            }
          } catch (e) {
            // If check fails, allow normal behavior
          }
        }
        
        // Use parent's toggleBold - since we extend Bold, just toggle the mark
        // This will use the parent's implementation
        return chain().toggleMark('bold').run();
      },
    };
  },
  addProseMirrorPlugins() {
    // Simplified - main mark removal is handled by ScripturePill plugin
    // This just prevents bold from being toggled/applied when cursor is after a pill
    return [
      ...(this.parent?.() || []),
    ];
  },
});

