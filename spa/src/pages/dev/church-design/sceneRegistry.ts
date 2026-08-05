/**
 * Church org design gallery scenes (dev only).
 *
 * Separate from the Shared Spaces gallery on purpose: that scene list is tied
 * to the release-verification screenshot baselines, and church org must not
 * touch the shared-spaces release surface.
 *
 * Phase key (all four shipped in v2.18.0):
 *   Admin   — server/routes/churches.ts + /admin/churches
 *   Connect — congregant links their account to a church (Settings › My Church)
 *   Receive — connected congregants browse, follow, and read ministry channels
 *   Staff   — roster management and role-gated tooling on org-owned spaces
 *
 * Broadcast spaces = ministry / curriculum channels (adult ed, sermon series,
 * students, etc.) — not an announcements bulletin. See
 * docs/CHURCH_ORG_ONBOARDING_AND_BILLING.md for the runbook.
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
    title: 'Settings › My Church (home not connected)',
    phase: 'Connect',
    editFiles: ['spa/src/pages/prototype/settings/PrototypeChurchPage.tsx'],
  },
  {
    id: '05-connect-prompt',
    title: 'Your church joined Harvous',
    phase: 'Connect',
    editFiles: ['spa/src/pages/prototype/settings/PrototypeChurchPage.tsx'],
  },
  {
    id: '06-settings-church-connected',
    title: 'Settings › My Church (home + other)',
    phase: 'Connect',
    editFiles: [
      'spa/src/pages/prototype/settings/PrototypeChurchPage.tsx',
      'docs/future/CHURCH_CONNECTION_SYSTEM.md',
    ],
  },
  {
    id: '07-from-your-church',
    title: 'Home › From your church (study feed)',
    phase: 'Receive',
    editFiles: ['spa/src/pages/prototype/PrototypeHomeChurchFeed.tsx'],
  },
  {
    id: '08-broadcast-space',
    title: 'Ministry channel (adult education)',
    phase: 'Receive',
    editFiles: ['spa/src/pages/prototype/PrototypeSidebarChurchHubView.tsx'],
  },
  {
    id: '09-broadcast-note',
    title: 'Home › This Sunday (start my note)',
    phase: 'Receive',
    editFiles: ['spa/src/pages/prototype/PrototypeHomeThisSunday.tsx'],
  },
  {
    id: '10-staff-roles',
    title: 'Staff roles on a ministry channel',
    phase: 'Staff',
    editFiles: ['spa/src/pages/prototype/PrototypeChurchStaffSection.tsx'],
  },
  {
    id: '11-teaching-plan',
    title: 'My Church › Teaching plan (staff)',
    phase: 'Staff',
    editFiles: ['spa/src/pages/prototype/PrototypeChurchTeachingPlanSection.tsx'],
  },
  {
    id: '12-teaching-plan-lapsed',
    title: 'Teaching plan (church plan lapsed)',
    phase: 'Staff',
    editFiles: [
      'spa/src/pages/prototype/PrototypeChurchTeachingPlanSection.tsx',
      'server/utils/church-entitlement.ts',
    ],
  },
  {
    id: '13-service-page',
    title: 'Service page — fresh',
    phase: 'Receive',
    editFiles: ['spa/src/styles/prototype-components.css'],
    speculative: true,
  },
  {
    id: '13b-service-page-returning',
    title: 'Service page — already writing',
    phase: 'Receive',
    editFiles: ['spa/src/styles/prototype-components.css'],
    speculative: true,
  },
  {
    id: '13c-service-page-topical',
    title: 'Service page — no passage',
    phase: 'Receive',
    editFiles: ['spa/src/styles/prototype-components.css'],
    speculative: true,
  },
  {
    id: '14-hub-congregant',
    title: 'My Church hub — congregant (rework)',
    phase: 'Receive',
    editFiles: ['spa/src/pages/prototype/PrototypeSidebarChurchHubView.tsx'],
  },
  {
    id: '15-hub-staff',
    title: 'My Church hub — staff (rework)',
    phase: 'Staff',
    editFiles: [
      'spa/src/pages/prototype/PrototypeSidebarChurchHubView.tsx',
      'spa/src/pages/prototype/PrototypeChurchPlanRow.tsx',
    ],
  },
];

export const DEFAULT_CHURCH_SCENE_ID = '01-admin-empty';

export function churchSceneById(id: string | undefined): ChurchDesignScene | undefined {
  if (!id) return undefined;
  return CHURCH_DESIGN_SCENES.find((scene) => scene.id === id);
}
