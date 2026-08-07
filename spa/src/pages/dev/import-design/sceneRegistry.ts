/**
 * Import design gallery scenes (dev only).
 *
 * The import surface has more states than any other single screen in the app —
 * six container phases, twelve row phases, and the failure modes that only show up
 * against a real server. Driving each one by hand means dropping the right broken
 * file at the right moment, so they live here as fixtures instead.
 *
 * Group key:
 *   Entry   — before anything has been dropped
 *   Review  — files parsed, waiting on the user
 *   Running — the import is working
 *   Trouble — rate limits, stops, failures
 *   Done    — the summary
 *   Parts   — individual primitives, isolated
 */

export interface ImportDesignScene {
  id: string;
  title: string;
  group: 'Entry' | 'Review' | 'Running' | 'Trouble' | 'Done' | 'Parts';
  /** What this state is for, and what to look at. */
  note?: string;
  /** Primary files to edit for this state. */
  editFiles: string[];
}

const SURFACE_FILES = [
  'spa/src/pages/prototype/import/ImportWorkspace.tsx',
  'spa/src/pages/prototype/settings/PrototypeDataPage.tsx',
  'spa/src/styles/prototype-components.css',
];

export const IMPORT_DESIGN_SCENES: ImportDesignScene[] = [
  {
    id: '01-empty',
    title: 'Empty surface',
    group: 'Entry',
    note: 'The first thing someone sees: a hand of the notes you already have, in four formats. Has to explain what can be dropped without reading like a spec.',
    editFiles: [
      'spa/src/pages/prototype/import/ImportSourceFan.tsx',
      'spa/src/pages/prototype/import/ImportDropZone.tsx',
      ...SURFACE_FILES,
    ],
  },
  {
    id: '02-drag-over',
    title: 'Dragging over',
    group: 'Entry',
    note: 'The scatter collects into one squared-up pile — sheets landing a beat apart, outermost first, labels fading as they stack — and then rests. No outline, no wash, no float. Pinned here, no real drag needed.',
    editFiles: [
      'spa/src/pages/prototype/import/ImportSourceFan.tsx',
      'spa/src/styles/prototype-components.css',
    ],
  },
  {
    id: '03-compact-strip',
    title: 'Add-more strip',
    group: 'Entry',
    note: 'What the drop zone shrinks to once rows exist, with a warning notice under it.',
    editFiles: ['spa/src/pages/prototype/import/ImportDropZone.tsx', ...SURFACE_FILES],
  },
  {
    id: '04-uploading',
    title: 'Reading files',
    group: 'Review',
    note: 'Three at a time: real upload percentage, then an indeterminate shimmer while the server parses.',
    editFiles: ['spa/src/pages/prototype/import/ImportFileRow.tsx', ...SURFACE_FILES],
  },
  {
    id: '05-review',
    title: 'Ready to import',
    group: 'Review',
    note: 'Each row says what it will become. A .enex is a whole notebook; a backup zip keeps its folders.',
    editFiles: ['spa/src/pages/prototype/import/ImportFileRow.tsx', ...SURFACE_FILES],
  },
  {
    id: '06-review-mixed',
    title: 'Review with problems',
    group: 'Review',
    note: 'Unsupported, unreadable, and excluded rows sitting alongside good ones.',
    editFiles: ['spa/src/pages/prototype/import/ImportFileRow.tsx', ...SURFACE_FILES],
  },
  {
    id: '07-importing',
    title: 'Importing',
    group: 'Running',
    note: 'Commit fills the first 75% of each bar, scripture linking the rest. Nothing ever moves backwards.',
    editFiles: ['spa/src/pages/prototype/import/ImportFileRow.tsx', ...SURFACE_FILES],
  },
  {
    id: '08-importing-large',
    title: 'Importing a big library',
    group: 'Running',
    note: 'Twenty-plus rows: check density, the sticky footer, and that finished rows still read as finished.',
    editFiles: ['spa/src/pages/prototype/import/ImportFileRow.tsx', ...SURFACE_FILES],
  },
  {
    id: '09-rate-limited',
    title: 'Waiting out a rate limit',
    group: 'Trouble',
    note: 'The server asked us to slow down. A pause, not a failure — say so.',
    editFiles: SURFACE_FILES,
  },
  {
    id: '10-paused',
    title: 'Stopped',
    group: 'Trouble',
    note: 'Stop reverts queued work; the footer becomes Continue and says exactly where it left off.',
    editFiles: SURFACE_FILES,
  },
  {
    id: '11-failures',
    title: 'Partial failure',
    group: 'Trouble',
    note: 'One file failed outright, one imported half its notes. Both stay actionable.',
    editFiles: ['spa/src/pages/prototype/import/ImportFileRow.tsx', ...SURFACE_FILES],
  },
  {
    id: '12-summary',
    title: 'Summary (clean run)',
    group: 'Done',
    note: 'Closes on the same pile the drop zone gathers — last frame of that motion, not a green tick. The perspective line changes with the size of the import.',
    editFiles: ['spa/src/pages/prototype/import/ImportSummaryCard.tsx', 'spa/src/styles/prototype-components.css'],
  },
  {
    id: '13-summary-issues',
    title: 'Summary with issues',
    group: 'Done',
    note: 'Every non-success becomes its own card rather than a count the user has to go hunting for.',
    editFiles: ['spa/src/pages/prototype/import/ImportSummaryCard.tsx', 'spa/src/styles/prototype-components.css'],
  },
  {
    id: '14-summary-nothing',
    title: 'Summary (all duplicates)',
    group: 'Done',
    note: "Re-importing the same backup. Nothing was duplicated, and that's the good outcome — not an error.",
    editFiles: ['spa/src/pages/prototype/import/ImportSummaryCard.tsx', 'spa/src/styles/prototype-components.css'],
  },
  {
    id: '15-progress-bar',
    title: 'Progress bar states',
    group: 'Parts',
    note: 'The primitive on its own — ink along a ruled line, not a blue pill. Determinate, indeterminate, with label, with percent, and the two ends of the range where a bar usually goes wrong.',
    editFiles: ['spa/src/pages/prototype/import/ProtoProgressBar.tsx', 'spa/src/styles/prototype-components.css'],
  },
  {
    id: '16-row-phases',
    title: 'Every row phase',
    group: 'Parts',
    note: 'All twelve row phases stacked, for scanning chip colour, alignment, and truncation together.',
    editFiles: ['spa/src/pages/prototype/import/ImportFileRow.tsx', 'spa/src/styles/prototype-components.css'],
  },
];

export const DEFAULT_IMPORT_SCENE_ID = '01-empty';

export function importSceneById(id: string | undefined): ImportDesignScene | undefined {
  if (!id) return undefined;
  return IMPORT_DESIGN_SCENES.find((scene) => scene.id === id);
}
