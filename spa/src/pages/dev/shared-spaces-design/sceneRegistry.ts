export interface SharedSpacesDesignScene {
  id: string;
  title: string;
  phase: 'Acquire' | 'Shell' | 'Collaboration' | 'Confirms';
  /** Primary files to edit for this touch point. */
  editFiles: string[];
  screenshotSlug?: string;
}

export const SHARED_SPACES_DESIGN_SCENES: SharedSpacesDesignScene[] = [
  {
    id: '01-addon-inactive',
    title: 'Shared Spaces — sign in to upgrade',
    phase: 'Acquire',
    editFiles: ['src/components/react/UpgradePageContent.tsx', 'src/styles/upgrade-page.css'],
    screenshotSlug: '01-addon-page-user-b-no-addon',
  },
  {
    id: '02-settings-addons',
    title: 'Settings › Add-ons (inactive)',
    phase: 'Acquire',
    editFiles: ['spa/src/pages/prototype/settings/PrototypeAddonsPage.tsx'],
    screenshotSlug: '02-settings-addons-before-grant',
  },
  {
    id: '03-addon-active',
    title: 'Shared Spaces — active subscriber',
    phase: 'Acquire',
    editFiles: ['src/components/react/UpgradePageContent.tsx'],
    screenshotSlug: '03-addon-page-user-a-active',
  },
  {
    id: '04-settings-active',
    title: 'Settings › Add-ons (active)',
    phase: 'Acquire',
    editFiles: ['spa/src/pages/prototype/settings/PrototypeAddonsPage.tsx'],
    screenshotSlug: '04-settings-addons-active',
  },
  {
    id: '05-space-switcher',
    title: 'Space switcher menu',
    phase: 'Shell',
    editFiles: ['spa/src/pages/prototype/SpaceSwitcherMenu.tsx', 'spa/src/styles/prototype-components.css'],
    screenshotSlug: '05-space-switcher-menu-with-space',
  },
  {
    id: '06-switcher-create',
    title: 'New shared space form',
    phase: 'Shell',
    editFiles: ['spa/src/pages/prototype/SpaceSwitcherMenu.tsx', 'src/utils/space-cover.ts'],
    screenshotSlug: '06-space-switcher-create-form-colors',
  },
  {
    id: '07-shared-sidebar',
    title: 'Shared space sidebar (owner)',
    phase: 'Shell',
    editFiles: ['spa/src/pages/prototype/PrototypeSidebarSharedSpaceView.tsx'],
    screenshotSlug: '07-shared-space-sidebar-owner',
  },
  {
    id: '08-people-sheet',
    title: 'People sheet — settings + invites',
    phase: 'Shell',
    editFiles: ['spa/src/pages/prototype/PrototypeSpaceSettingsSection.tsx', 'src/utils/space-cover.ts'],
    screenshotSlug: '08-people-sheet-owner-invites-danger-zone',
  },
  {
    id: '09-join-logged-out',
    title: 'Join page — logged out',
    phase: 'Acquire',
    editFiles: [
      'src/utils/space-cover.ts',
      'spa/src/pages/public/PublicJoinSpaceLetter.tsx',
      'spa/src/lib/space-cover-display.ts',
      'src/styles/join-space-page.css',
    ],
    screenshotSlug: '09-join-page-logged-out',
  },
  {
    id: '10-join-logged-in',
    title: 'Join page — before join',
    phase: 'Acquire',
    editFiles: ['spa/src/pages/public/PublicJoinSpaceLetter.tsx', 'src/styles/join-space-page.css'],
    screenshotSlug: '10-join-page-user-b-before-join',
  },
  {
    id: '11-member-sidebar',
    title: 'Member sidebar after join',
    phase: 'Shell',
    editFiles: ['spa/src/pages/prototype/PrototypeSidebarSharedSpaceView.tsx'],
    screenshotSlug: '11-shared-space-sidebar-member-after-join',
  },
  {
    id: '12-author-list',
    title: 'Note list with author chips',
    phase: 'Collaboration',
    editFiles: ['spa/src/pages/prototype/SharedSpaceNoteAuthorChip.tsx', 'spa/src/pages/prototype/PrototypeSidebarSharedSpaceView.tsx'],
    screenshotSlug: '13-shared-space-list-with-author-chips',
  },
  {
    id: '13-readonly-banner',
    title: 'Read-only foreign note banner',
    phase: 'Collaboration',
    editFiles: ['spa/src/pages/prototype/PrototypeSharedNoteReadOnlyBanner.tsx', 'spa/src/styles/prototype-components.css'],
    screenshotSlug: '14-read-only-foreign-note-banner',
  },
  {
    id: '14-copy-menu',
    title: 'Copy to shared space menu',
    phase: 'Collaboration',
    editFiles: ['spa/src/pages/prototype/PrototypeNoteMoreMenu.tsx'],
    screenshotSlug: '16-copy-to-shared-space-submenu',
  },
  {
    id: '15-revoke-confirm',
    title: 'Turn off invite confirm',
    phase: 'Confirms',
    editFiles: ['spa/src/pages/prototype/ProtoConfirmDialog.tsx'],
    screenshotSlug: '17-confirm-revoke-invite-dialog',
  },
  {
    id: '16-leave-confirm',
    title: 'Leave space confirm',
    phase: 'Confirms',
    editFiles: ['spa/src/pages/prototype/ProtoConfirmDialog.tsx'],
    screenshotSlug: '18-confirm-leave-space-dialog',
  },
  {
    id: '17-delete-confirm',
    title: 'Delete space confirm',
    phase: 'Confirms',
    editFiles: ['spa/src/pages/prototype/ProtoConfirmDialog.tsx'],
    screenshotSlug: '19-confirm-delete-space-dialog',
  },
  {
    id: '18-full-dashboard',
    title: 'Space dashboard — full example (busy week)',
    phase: 'Shell',
    editFiles: [
      'spa/src/pages/prototype/PrototypeSidebarSharedSpaceView.tsx',
      'spa/src/pages/prototype/SharedSpaceAboutSheet.tsx',
      'spa/src/pages/prototype/SharedSpaceAboutLetter.tsx',
      'spa/src/pages/dev/shared-spaces-design/shared-space-dashboard-fixtures.ts',
      'spa/src/pages/dev/shared-spaces-design/SharedSpaceDashboardFixtureView.tsx',
      'spa/src/styles/prototype-components.css',
    ],
    screenshotSlug: '20-shared-space-dashboard-full',
  },
  {
    id: '19-social-dashboard',
    title: 'Space dashboard — social greeting variant',
    phase: 'Shell',
    editFiles: [
      'spa/src/pages/prototype/SharedSpaceSocialGreeting.tsx',
      'spa/src/pages/dev/shared-spaces-design/shared-space-dashboard-fixtures.ts',
    ],
    screenshotSlug: '21-shared-space-dashboard-social',
  },
  {
    id: '20-join-cover-colors',
    title: 'Join hero — all space cover colors',
    phase: 'Acquire',
    editFiles: [
      'src/utils/space-cover.ts',
      'spa/src/lib/space-cover-display.ts',
      'spa/src/pages/public/PublicJoinSpaceHero.tsx',
      'spa/src/pages/dev/shared-spaces-design/SharedSpacesDesignScenePreview.tsx',
    ],
    screenshotSlug: '22-join-cover-colors-all',
  },
];

export function sceneById(id: string | undefined): SharedSpacesDesignScene | undefined {
  return SHARED_SPACES_DESIGN_SCENES.find((s) => s.id === id);
}

export const DEFAULT_DESIGN_SCENE_ID = SHARED_SPACES_DESIGN_SCENES[0]?.id ?? '01-addon-inactive';
