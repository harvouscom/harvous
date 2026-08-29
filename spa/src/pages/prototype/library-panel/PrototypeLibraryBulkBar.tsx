/**
 * What you can do with what you have selected, in the search panel.
 *
 * The same six verbs, the same gate and the same chrome as the sidebar's bar — literally the
 * same `.proto-bulk-bar` classes, because a reader moving between the two surfaces should
 * find one control, not two that resemble each other. What differs is only where it sits.
 *
 * Enablement is all-or-nothing: an action lights up when every selected note can take it.
 * One foreign note in the batch disables it rather than the action half-applying, which is
 * the rule `availablePrototypeCommands` already encodes — this asks it rather than
 * re-deriving a second opinion.
 */
import Icon from '@/components/react/Icon';
import { usePrototypeShiftHints } from '../../../hooks/usePrototypeShiftHints';
import {
  availablePrototypeCommands,
  prototypeCommandById,
  type PrototypeCommandId,
} from '../../../lib/prototype-commands';
import { bulkDestructiveCopy } from '../proto-destructive-copy';
import type { LibrarySelection } from './use-library-selection';

/**
 * Icon, bar label and keycap per verb.
 *
 * The label here is the bar's, not the command's. `referenceLabel` is written for the
 * settings shortcut sheet, where a row has to say what it does with no context around it
 * ("Move to folder"); on a bar under a selection the surrounding words are already there, so
 * the sidebar says "Folder" and so does this. The command's contextual label — "Move 4 notes
 * to a folder…" — is the tooltip, which is where the long form belongs.
 *
 * "Folder", not "File": this app has literal files on its shelves now and the verb would read
 * as the noun. The icon carries the doing.
 */
const VERB_CHROME: Record<
  PrototypeCommandId,
  { icon: string; label: string; hint?: string; danger?: boolean }
> = {
  'organize.folder': { icon: 'folder', label: 'Folder', hint: 'M' },
  'organize.thread': { icon: 'arrow-right-arrow-left', label: 'Thread', hint: 'T' },
  'organize.pin': { icon: 'thumbtack', label: 'Pin' },
  'organize.share': { icon: 'share', label: 'Share' },
  'organize.removeFromSpace': { icon: 'circle-minus', label: 'Remove', danger: true },
  'organize.delete': { icon: 'trash-can', label: 'Delete', hint: '⌫', danger: true },
};

/** Bar order: build, then send, then take away. Destructives last and marked. */
const ORDER: PrototypeCommandId[] = [
  'organize.folder',
  'organize.thread',
  'organize.pin',
  'organize.share',
  'organize.removeFromSpace',
  'organize.delete',
];

export default function PrototypeLibraryBulkBar({
  selection,
}: {
  selection: LibrarySelection;
}) {
  const showShiftHints = usePrototypeShiftHints();
  const ctx = selection.context;
  if (!selection.active || selection.selectedIds.length === 0) return null;

  /* No context means a selected row is not loaded — see the hook. The bar still shows, so
     the count and the way out stay put, but nothing in it can fire. */
  const enabled = new Set(ctx ? availablePrototypeCommands(ctx).map((c) => c.id) : []);
  const offered = ORDER.filter((id) => {
    /* Folders, Threads and highlights have two verbs and have never had more: you pin one or
       you take it away. The other four are things you do to a *note*, and offering them
       permanently greyed would be four dead controls under every folder selection. */
    if (selection.kind !== 'note') return id === 'organize.pin' || id === 'organize.delete';
    /* Remove-from-space and share are opposites of one another: you can only take a note out
       of a space you are in, and only send one from a space you are not. Offering both would
       leave one permanently dark. */
    if (id === 'organize.removeFromSpace') return ctx?.isScopedSharedSpace ?? false;
    if (id === 'organize.share') return !(ctx?.isScopedSharedSpace ?? false);
    return true;
  });

  return (
    <div className="proto-collection-grid-actions proto-bulk-bar">
      {offered.map((id) => {
        const command = prototypeCommandById(id);
        const chrome = VERB_CHROME[id];
        if (!command) return null;
        return (
          <button
            key={id}
            type="button"
            className={`proto-bulk-bar__btn${chrome.danger ? ' proto-bulk-bar__btn--danger' : ''}`}
            disabled={!enabled.has(id) || !selection.run}
            title={ctx ? command.label(ctx) : command.referenceLabel}
            onClick={(event) =>
              selection.run?.(id, { anchorRect: event.currentTarget.getBoundingClientRect() })
            }
          >
            <Icon name={chrome.icon as never} size={15} aria-hidden />
            <span className="proto-bulk-bar__label">
              {id === 'organize.delete' && selection.kind
                ? bulkDestructiveCopy(selection.kind, selection.selectedIds.length).confirmLabel
                : chrome.label}
            </span>
            {/* Hold Shift and the bar says how to reach it without the mouse — the same
                teaching the toolbar orbs do, at the moment you are acting. */}
            {showShiftHints && chrome.hint ? (
              <span className="proto-bulk-bar__hint" aria-hidden="true">
                <kbd className="proto-kbd proto-kbd--hint">{chrome.hint}</kbd>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
