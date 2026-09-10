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
import type { SidebarSelectionKind } from '../../../layouts/proto-shell-context';
import { usePrototypeShiftHints } from '../../../hooks/usePrototypeShiftHints';
import {
  availablePrototypeCommands,
  destructiveVerbForKinds,
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

/**
 * Which verbs the bar puts up, given what is actually selected.
 *
 * The kind passed in is the *selection's*, not the tab's, and that distinction is the whole
 * point of this function. Everything lists all four kinds, so its tab kind is permanently
 * `'mixed'` — but three notes picked there are still three notes, and reading the tab meant
 * the bar offered a pile of notes two verbs while the gate one line below had already
 * approved all six. ⇧M and ⇧T worked from Everything the whole time; only the buttons were
 * missing.
 *
 * Folders, Threads and highlights have two verbs and have never had more: you pin one or you
 * take it away. The other four are things you do to a *note*, and offering them permanently
 * greyed would be four dead controls under every folder selection.
 *
 * The consequence is a bar that reflows while you select — check a folder alongside your
 * notes and Folder, Thread and Share go away, because the pile no longer has them in common.
 * That is the honest answer rather than the greyed union, and it is the same rule the gate
 * has always applied; the bar just says it out loud now.
 */
export function offeredBulkVerbs(
  actingKind: SidebarSelectionKind | null,
  isScopedSharedSpace: boolean,
): PrototypeCommandId[] {
  return ORDER.filter((id) => {
    if (actingKind !== 'note') return id === 'organize.pin' || id === 'organize.delete';
    /* Remove-from-space and share are opposites of one another: you can only take a note out
       of a space you are in, and only send one from a space you are not. Offering both would
       leave one permanently dark. */
    if (id === 'organize.removeFromSpace') return isScopedSharedSpace;
    if (id === 'organize.share') return !isScopedSharedSpace;
    return true;
  });
}

/** The kinds `bulkDestructiveCopy` writes a sentence for. */
function namesItsOwnDestructive(
  kind: SidebarSelectionKind | null,
): kind is 'note' | 'highlight' | 'folder' | 'thread' {
  return kind === 'note' || kind === 'highlight' || kind === 'folder' || kind === 'thread';
}

export default function PrototypeLibraryBulkBar({
  selection,
}: {
  selection: LibrarySelection;
}) {
  const showShiftHints = usePrototypeShiftHints();
  const ctx = selection.context;
  if (!selection.active || selection.selectedIds.length === 0) return null;

  /*
   * What the bar is speaking about.
   *
   * `ctx.kind` is already collapsed to the sole kind when a selection has one — the hook does
   * it while unpacking composite ids — so this is a single-kind pile's real kind on any tab,
   * and `'mixed'` only when the pile genuinely is. `selection.kind` is the fallback for the
   * one case with no context: a selected row past the loaded page, where the tab's shape at
   * least keeps the bar from jumping while it arrives.
   */
  const actingKind = ctx?.kind ?? selection.kind;

  /* No context means a selected row is not loaded — see the hook. The bar still shows, so
     the count and the way out stay put, but nothing in it can fire. */
  const enabled = new Set(ctx ? availablePrototypeCommands(ctx).map((c) => c.id) : []);
  const offered = offeredBulkVerbs(actingKind, ctx?.isScopedSharedSpace ?? false);

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
              {id === 'organize.delete'
                ? namesItsOwnDestructive(actingKind)
                  ? bulkDestructiveCopy(actingKind, selection.selectedIds.length).confirmLabel
                  : /* A pile of several kinds has no one sentence; the confirm spells out the
                       difference, and the button says the stronger of the two words. */
                    destructiveVerbForKinds(ctx?.kinds ?? ['note'])
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
