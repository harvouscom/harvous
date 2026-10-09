/**
 * Demo mode for the Family screens (`/__dev/family-design`).
 *
 * Inside a provider, the family hooks read progress from the fixture and turn every action
 * into a no-op that calls `onAction` instead of the API. That is what lets the gallery render
 * the real Settings › Family screens without a button anywhere able to touch a real family —
 * "Stop family sharing" in a demo must never reach `DELETE /api/family`.
 */
import { createContext } from 'react';
import type { FamilyProgressEntry } from './useFamily';

export type FamilyDemo = {
  /** Distinguishes cached fixtures between panels on the same page. */
  id: string;
  progress: FamilyProgressEntry[];
  /** Called instead of the API when someone presses a button in the demo. */
  onAction?: (label: string) => void;
};

export const FamilyDemoContext = createContext<FamilyDemo | null>(null);
