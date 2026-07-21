/**
 * Church org design gallery scenes (dev only).
 *
 * Separate from the Shared Spaces gallery on purpose: that scene list is tied
 * to the release-verification screenshot baselines, and church org must not
 * touch the shared-spaces release surface.
 *
 * Phase key:
 *   Admin   — built today (server/routes/churches.ts + /admin/churches)
 *   Connect — future: congregant links their account to a church
 *   Receive — future: connected congregants see church curriculum
 *   Staff   — future: leader-role tooling on org-owned spaces
 *
 * Only the Admin scenes reflect shipped UI. Everything else is design
 * exploration for phases that are deliberately unbuilt — see
 * docs/future/PASTOR_FEATURES_ROADMAP.md.
 */

export interface ChurchDesignScene {
  id: string;
  title: string;
  phase: 'Admin' | 'Connect' | 'Receive' | 'Staff';
  /** Primary files to edit for this touch point (or the doc, for unbuilt phases). */
  editFiles: string[];
  /** Set when the scene previews UI that does not exist in the product yet. */
  speculative?: boolean;
}

export const CHURCH_DESIGN_SCENES: ChurchDesignScene[] = [
  {
    id: '01-admin-empty',
    title: 'Admin › Churches (empty)',
    phase: 'Admin',
    editFiles: ['src/components/react/AdminChurchesPanel.tsx'],
  },
  {
    id: '02-admin-registered',
    title: 'Admin › Churches (registered)',
    phase: 'Admin',
    editFiles: ['src/components/react/AdminChurchesPanel.tsx'],
  },
  {
    id: '03-admin-church-actions',
    title: 'Admin › Church actions expanded',
    phase: 'Admin',
    editFiles: ['src/components/react/AdminChurchesPanel.tsx'],
  },
  {
    id: '04-settings-church-unconnected',
    title: 'Settings › My Church (today)',
    phase: 'Connect',
    editFiles: ['spa/src/pages/prototype/settings/PrototypeChurchPage.tsx'],
  },
  {
    id: '05-connect-prompt',
    title: 'Your church joined Harvous',
    phase: 'Connect',
    editFiles: ['docs/future/CHURCH_CONNECTION_SYSTEM.md'],
    speculative: true,
  },
  {
    id: '06-settings-church-connected',
    title: 'Settings › My Church (connected)',
    phase: 'Connect',
    editFiles: ['docs/future/CHURCH_CONNECTION_SYSTEM.md'],
    speculative: true,
  },
  {
    id: '07-from-your-church',
    title: 'Home › From your church',
    phase: 'Receive',
    editFiles: ['docs/future/CHURCH_ORG_AND_CURRICULUM.md'],
    speculative: true,
  },
  {
    id: '08-broadcast-space',
    title: 'Church broadcast space',
    phase: 'Receive',
    editFiles: ['docs/future/CHURCH_ORG_AND_CURRICULUM.md'],
    speculative: true,
  },
  {
    id: '09-broadcast-note',
    title: 'Church note › save to my notes',
    phase: 'Receive',
    editFiles: ['docs/future/CHURCH_ORG_AND_CURRICULUM.md'],
    speculative: true,
  },
  {
    id: '10-staff-roles',
    title: 'Staff roles on an org space',
    phase: 'Staff',
    editFiles: ['server/utils/clerk-org.ts'],
    speculative: true,
  },
];

export const DEFAULT_CHURCH_SCENE_ID = '01-admin-empty';

export function churchSceneById(id: string | undefined): ChurchDesignScene | undefined {
  if (!id) return undefined;
  return CHURCH_DESIGN_SCENES.find((scene) => scene.id === id);
}
