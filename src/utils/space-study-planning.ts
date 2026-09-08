/**
 * The per-room switch for "what do we study next".
 *
 * Phase 1 of docs/future/SPACE_STUDY_SUGGESTIONS_AND_VOTES.md ships `'off'`
 * and `'suggest'`. `'vote'` is reserved for the slate-and-vote phase and is
 * refused by the write route until then, so the client never offers it.
 */
export type StudyPlanningMode = 'off' | 'suggest';

export const STUDY_PLANNING_MODES: readonly StudyPlanningMode[] = ['off', 'suggest'];

export function parseStudyPlanningMode(value: unknown): StudyPlanningMode {
  return value === 'suggest' ? 'suggest' : 'off';
}

export const STUDY_PLANNING_MODE_LABELS: Record<StudyPlanningMode, string> = {
  off: 'Off',
  suggest: 'Members can suggest',
};
