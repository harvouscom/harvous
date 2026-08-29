/**
 * What a keyboard verb, a bulk bar button and a palette row all need to agree on.
 *
 * Three surfaces want the same question answered — *may this act on these things, and
 * what should it be called* — and before this they answered it three times. The bulk bar
 * derived its own enablement inline, the row menu derived its own, and a palette would
 * have made three. `note-row-capabilities.ts` already exists to stop the first two
 * drifting; this is the layer above it that adds the target and the wording.
 *
 * Deliberately pure. No React, no mutations, no DOM — a command's `run` is supplied by
 * the surface that owns the sheets and confirms (`PrototypeSidebar`), so this file stays
 * a table of rules that a test can read straight through.
 */
import type { SidebarSelectionKind } from '../layouts/proto-shell-context';
import { everyRowAllows, type NoteRowCapabilityInput } from './note-row-capabilities';
import { NOTE_SELECTION_CAP } from './note-selection';

/** Verbs a keyboard chord can raise. The palette offers these plus navigation. */
export type PrototypeCommandId =
  | 'organize.folder'
  | 'organize.thread'
  | 'organize.pin'
  | 'organize.share'
  | 'organize.removeFromSpace'
  | 'organize.delete';

/**
 * What a verb is pointed at.
 *
 * `fromSelection` is not derivable from `ids.length` — a selection of exactly one and a
 * focused row with nothing selected are both one id, and they differ in wording ("Delete
 * 1 note" reads wrong for a row you are merely standing on) and in whether size floors
 * like the Thread minimum apply.
 */
export type CommandContext = {
  kind: SidebarSelectionKind;
  /** The selected ids, or the single focused row's id. */
  ids: string[];
  /** One entry per id, in the same order — the input to the capability gate. */
  rows: NoteRowCapabilityInput[];
  fromSelection: boolean;
  isScopedSharedSpace: boolean;
};

export type PrototypeCommandGroup = 'Organize';

export type PrototypeCommand = {
  id: PrototypeCommandId;
  /** Keycap characters for `ProtoKbdChord`; also what the shortcuts reference prints. */
  keys: string;
  /** Fixed name for the settings reference, where there is no context to read. */
  referenceLabel: string;
  group: PrototypeCommandGroup;
  icon: string;
  label: (ctx: CommandContext) => string;
  enabled: (ctx: CommandContext) => boolean;
};

/**
 * Folder assignment used to stop at 20 while everything else allowed 50, because it fanned
 * out one write per note against a 20/min per-endpoint limit. `POST
 * /api/notes/folders/assign-batch` now does personal notes in one request, so the ceiling
 * is the ordinary selection cap.
 *
 * Shared spaces still fan out — their labels live on `SpaceNotes` and each carries its own
 * permission check — so the old ceiling survives for them alone.
 */
export const FOLDER_FANOUT_CAP = NOTE_SELECTION_CAP;
export const SHARED_FOLDER_FANOUT_CAP = 20;

/** Mirrors `MIN_THREAD_NOTES` in the create sheet — a Thread needs two ends. */
export const MIN_BULK_THREAD_NOTES = 2;

/** Kinds whose rows carry a pin. Notes pin one at a time; there is no bulk pin for them. */
const PINNABLE_KINDS: readonly SidebarSelectionKind[] = ['note', 'highlight', 'folder', 'thread'];

/** The noun a command says when it has to name what it is acting on. */
export function commandNoun(kind: SidebarSelectionKind, count: number): string {
  const plural = count !== 1;
  switch (kind) {
    case 'note':
      return plural ? 'notes' : 'note';
    case 'highlight':
      return plural ? 'highlights' : 'highlight';
    case 'folder':
      return plural ? 'folders' : 'folder';
    case 'thread':
    case 'sharedThread':
      return plural ? 'Threads' : 'Thread';
    case 'resource':
      return plural ? 'resources' : 'resource';
    default:
      return plural ? 'items' : 'item';
  }
}

/**
 * "Move 4 notes to a folder…" when a set is standing, "Move to a folder…" when you are
 * merely on a row. Counting a row you have not chosen reads as though something was
 * selected behind your back.
 */
function phrase(ctx: CommandContext, verb: string, tail = ''): string {
  const suffix = tail ? ` ${tail}` : '';
  if (!ctx.fromSelection) return `${verb}${suffix}`;
  return `${verb} ${ctx.ids.length} ${commandNoun(ctx.kind, ctx.ids.length)}${suffix}`;
}

/**
 * The word the destructive uses, by kind. Kinds not listed here genuinely delete.
 *
 * Exported because the confirm dialog has to say the same word as the button that raised it
 * — see `bulkDestructiveCopy`. Two tables agreeing today is two tables disagreeing later.
 */
export function destructiveVerbFor(kind: SidebarSelectionKind): 'Remove' | 'Delete' {
  return kind === 'folder' || kind === 'thread' || kind === 'sharedThread' ? 'Remove' : 'Delete';
}

/** Nothing acts on an empty target — the gate below returns false for every verb. */
function hasTarget(ctx: CommandContext): boolean {
  return ctx.ids.length > 0 && ctx.rows.length === ctx.ids.length;
}

export const PROTOTYPE_COMMANDS: readonly PrototypeCommand[] = [
  {
    id: 'organize.folder',
    keys: '⇧M',
    referenceLabel: 'Move to folder',
    group: 'Organize',
    icon: 'folder',
    label: (ctx) => phrase(ctx, 'Move', 'to a folder…'),
    enabled: (ctx) =>
      hasTarget(ctx) &&
      ctx.kind === 'note' &&
      everyRowAllows(ctx.rows, 'mayOrganize') &&
      ctx.ids.length <= (ctx.isScopedSharedSpace ? SHARED_FOLDER_FANOUT_CAP : FOLDER_FANOUT_CAP),
  },
  {
    id: 'organize.thread',
    keys: '⇧T',
    referenceLabel: 'Add to Thread',
    group: 'Organize',
    icon: 'arrow-right-arrow-left',
    label: (ctx) => phrase(ctx, 'Start a Thread from', ''),
    /**
     * A Thread is a relationship, so one note cannot be one. That floor applies only to a
     * standing selection — from a single focused row there is nothing to relate yet, so
     * the verb is not offered rather than offered and refused at the end of a form.
     */
    enabled: (ctx) =>
      hasTarget(ctx) &&
      ctx.kind === 'note' &&
      ctx.fromSelection &&
      everyRowAllows(ctx.rows, 'mayManageThread') &&
      ctx.ids.length >= MIN_BULK_THREAD_NOTES,
  },
  {
    id: 'organize.pin',
    keys: '⇧P',
    referenceLabel: 'Pin or unpin',
    group: 'Organize',
    icon: 'thumbtack',
    label: (ctx) => phrase(ctx, 'Pin'),
    /**
     * Notes pin one at a time — `usePinSpaceNote` is single-id and a bulk fan-out would
     * meet the same write limit that caps folder assignment. Highlights, folders and
     * Threads have real bulk pins in their bars, so those take a selection.
     */
    enabled: (ctx) =>
      hasTarget(ctx) &&
      PINNABLE_KINDS.includes(ctx.kind) &&
      everyRowAllows(ctx.rows, 'mayPin') &&
      (ctx.kind !== 'note' || !ctx.fromSelection || ctx.ids.length === 1),
  },
  {
    id: 'organize.share',
    keys: '',
    referenceLabel: 'Share to a space',
    group: 'Organize',
    icon: 'share',
    label: (ctx) => phrase(ctx, 'Share', 'to a space…'),
    enabled: (ctx) => hasTarget(ctx) && ctx.kind === 'note' && everyRowAllows(ctx.rows, 'mayShareToSpace'),
  },
  {
    id: 'organize.removeFromSpace',
    keys: '',
    referenceLabel: 'Remove from space',
    group: 'Organize',
    icon: 'circle-minus',
    label: (ctx) => phrase(ctx, 'Remove', 'from this space'),
    enabled: (ctx) =>
      hasTarget(ctx) && ctx.kind === 'note' && everyRowAllows(ctx.rows, 'mayRemoveFromSpace'),
  },
  {
    id: 'organize.delete',
    keys: '⇧⌫',
    referenceLabel: 'Delete',
    group: 'Organize',
    icon: 'trash-can',
    /*
     * The verb changes with the kind, and getting it right is the whole job of this label.
     * Folders and Threads are *labels and connections* — removing one leaves every note
     * where it was, and `useRemoveFolder` / `useRemoveThreadCluster` do exactly that. Saying
     * "Delete" over them would promise something worse than what happens, on the one control
     * where an overstatement cannot be taken back.
     */
    label: (ctx) => phrase(ctx, destructiveVerbFor(ctx.kind)),
    enabled: (ctx) => hasTarget(ctx) && everyRowAllows(ctx.rows, 'mayDelete'),
  },
];

const COMMANDS_BY_ID = new Map(PROTOTYPE_COMMANDS.map((c) => [c.id, c] as const));

export function prototypeCommandById(id: PrototypeCommandId): PrototypeCommand | undefined {
  return COMMANDS_BY_ID.get(id);
}

/** The commands a surface should offer right now, already filtered by `enabled`. */
export function availablePrototypeCommands(ctx: CommandContext): PrototypeCommand[] {
  return PROTOTYPE_COMMANDS.filter((command) => command.enabled(ctx));
}

/** Chord → command, for the keyboard layer. Commands with no `keys` are palette-only. */
export const PROTOTYPE_COMMAND_BY_VERB: Readonly<Record<string, PrototypeCommandId>> = {
  folder: 'organize.folder',
  thread: 'organize.thread',
  pin: 'organize.pin',
  delete: 'organize.delete',
};

export type PrototypeCommandVerb = keyof typeof PROTOTYPE_COMMAND_BY_VERB;
