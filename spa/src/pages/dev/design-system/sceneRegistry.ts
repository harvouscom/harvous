export type DesignSystemScenePhase =
  | 'Foundations'
  | 'Primitives'
  | 'Patterns'
  | 'Acquire'
  | 'Shell'
  | 'Collaboration'
  | 'Confirms';

export interface DesignSystemScene {
  id: string;
  title: string;
  phase: DesignSystemScenePhase;
  /** Primary files to edit for this touch point. */
  editFiles: string[];
  screenshotSlug?: string;
  /** When true, scene is stable for Playwright visual baselines (fixture-only). */
  visualBaseline?: boolean;
}

/** Core design-system scenes — foundations + primitives. */
export const DESIGN_SYSTEM_CORE_SCENES: DesignSystemScene[] = [
  {
    id: 'ds-01-typography',
    title: 'Typography scale',
    phase: 'Foundations',
    editFiles: ['spa/src/styles/prototype-tokens.css', 'docs/design-parity/HARVOUS_BUILD_CONVENTIONS.md'],
    screenshotSlug: 'ds-01-typography',
    visualBaseline: true,
  },
  {
    id: 'ds-02-color',
    title: 'Appearance & surfaces',
    phase: 'Foundations',
    editFiles: [
      'spa/src/lib/prototype-background.ts',
      'shared/appearance-presets.json',
      'spa/src/styles/prototype-tokens.css',
    ],
    screenshotSlug: 'ds-02-color',
    visualBaseline: true,
  },
  {
    id: 'ds-03-spacing',
    title: 'Spacing, radius & elevation',
    phase: 'Foundations',
    editFiles: ['spa/src/styles/prototype-tokens.css', 'native/Harvous/DesignSystem/HarvousShape.swift'],
    screenshotSlug: 'ds-03-spacing',
    visualBaseline: true,
  },
  {
    id: 'ds-04-section-header',
    title: 'Section headers',
    phase: 'Primitives',
    editFiles: [
      'spa/src/pages/prototype/design-system/PrototypeSectionHeader.tsx',
      'native/Harvous/DesignSystem/HarvousSectionHeader.swift',
    ],
    screenshotSlug: 'ds-04-section-header',
    visualBaseline: true,
  },
  {
    id: 'ds-05-list-row',
    title: 'List rows',
    phase: 'Primitives',
    editFiles: [
      'spa/src/pages/prototype/design-system/PrototypeListRow.tsx',
      'native/Harvous/DesignSystem/HarvousListRow.swift',
    ],
    screenshotSlug: 'ds-05-list-row',
    visualBaseline: true,
  },
  {
    id: 'ds-05b-row-select',
    title: 'Row selection',
    phase: 'Primitives',
    editFiles: [
      'spa/src/pages/prototype/ProtoRowSelectCheckbox.tsx',
      'spa/src/styles/prototype-components.css',
    ],
    screenshotSlug: 'ds-05b-row-select',
    visualBaseline: true,
  },
  {
    id: 'ds-06-search',
    title: 'Search field',
    phase: 'Primitives',
    editFiles: [
      'spa/src/pages/prototype/components/PrototypeSearchInput.tsx',
      'native/Harvous/DesignSystem/HarvousSearchField.swift',
    ],
    screenshotSlug: 'ds-06-search',
    visualBaseline: true,
  },
  {
    id: 'ds-08-empty',
    title: 'Empty states',
    phase: 'Primitives',
    editFiles: [
      'spa/src/pages/prototype/PrototypeListEmptyState.tsx',
      'spa/src/pages/prototype/PrototypePaneEmptyState.tsx',
      'native/Harvous/DesignSystem/HarvousEmptyStateView.swift',
    ],
    screenshotSlug: 'ds-08-empty',
    visualBaseline: true,
  },
  {
    id: 'ds-09-popover',
    title: 'Popover & confirm',
    phase: 'Patterns',
    editFiles: [
      'spa/src/pages/prototype/ProtoPopoverShell.tsx',
      'spa/src/pages/prototype/ProtoConfirmDialog.tsx',
      'spa/src/hooks/usePopoverDismiss.ts',
    ],
    screenshotSlug: 'ds-09-popover',
    visualBaseline: true,
  },
  {
    id: 'ds-10-buttons',
    title: 'Buttons',
    phase: 'Primitives',
    editFiles: [
      'spa/src/styles/prototype-components.css',
      'spa/src/styles/prototype-editor.css',
    ],
    screenshotSlug: 'ds-10-buttons',
    visualBaseline: true,
  },
  {
    id: 'ds-11-inputs',
    title: 'Inputs',
    phase: 'Primitives',
    editFiles: [
      'spa/src/pages/prototype/components/PrototypeSearchInput.tsx',
      'spa/src/styles/prototype-components.css',
      'spa/src/pages/prototype/settings/account/accountShared.tsx',
    ],
    screenshotSlug: 'ds-11-inputs',
    visualBaseline: true,
  },
  {
    id: 'ds-12-toasts',
    title: 'Toasts',
    phase: 'Patterns',
    editFiles: [
      'spa/src/components/PrototypeFeedbackToast.tsx',
      'spa/src/components/PrototypeAppUpdateToast.tsx',
      'spa/src/styles/prototype-components.css',
    ],
    screenshotSlug: 'ds-12-toasts',
    visualBaseline: true,
  },
  {
    id: 'ds-13-thread-trail',
    title: 'Thread trail card',
    phase: 'Patterns',
    editFiles: [
      'spa/src/pages/prototype/PrototypeStudyThreadTrail.tsx',
      'spa/src/pages/prototype/PrototypeSharedThreadDrilldown.tsx',
      'spa/src/styles/prototype-components.css',
    ],
    screenshotSlug: 'ds-13-thread-trail',
    visualBaseline: true,
  },
  {
    id: 'ds-14-reader',
    title: 'Bible reader canvas',
    phase: 'Patterns',
    editFiles: [
      'spa/src/styles/prototype-components.css',
      'spa/src/styles/prototype-tokens.css',
      'native/Harvous/DesignSystem/HarvousTypography.swift',
      'native/Harvous/DesignSystem/HarvousShape.swift',
    ],
    screenshotSlug: 'ds-14-reader',
    visualBaseline: true,
  },
  {
    id: 'ds-15-paper-stack',
    title: 'Paper stack (note over reader)',
    phase: 'Patterns',
    editFiles: [
      'spa/src/styles/prototype-components.css',
      'spa/src/layouts/proto-motion.ts',
      'spa/src/styles/prototype-tokens.css',
    ],
    screenshotSlug: 'ds-15-paper-stack',
    // Interactive (stack toggle) — not a stable visual baseline.
  },
  {
    id: 'ds-16-reader-dock',
    title: 'Passage context',
    phase: 'Patterns',
    editFiles: [
      'src/components/react/PassageContextStrip.tsx',
      'spa/src/styles/prototype-components.css',
    ],
    screenshotSlug: 'ds-16-reader-dock',
    visualBaseline: true,
  },
  {
    id: 'ds-17-reader-inspector',
    title: 'Reader inspector',
    phase: 'Patterns',
    editFiles: [
      'spa/src/pages/prototype/PrototypeReaderInspectorPane.tsx',
      'spa/src/lib/proto-reading-prefs.ts',
      'spa/src/styles/prototype-components.css',
    ],
    screenshotSlug: 'ds-17-reader-inspector',
    // Interactive (text-size + verse-number controls write real prefs).
  },
  {
    id: 'ds-18-translation-row',
    title: 'Translation row',
    phase: 'Patterns',
    editFiles: [
      'spa/src/pages/prototype/settings/PrototypeTranslationRow.tsx',
      'spa/src/styles/prototype-components.css',
    ],
    screenshotSlug: 'ds-18-translation-row',
    // All five offline states at once — the real component, not a copy of its markup.
  },
  {
    id: 'ds-19-note-audience-bar',
    title: 'Note audience bar',
    phase: 'Patterns',
    editFiles: [
      'spa/src/pages/prototype/PrototypeNoteAudienceBar.tsx',
      'spa/src/pages/prototype/PrototypeDraftDestinationSheet.tsx',
      'spa/src/styles/prototype-components.css',
    ],
    screenshotSlug: 'ds-19-note-audience-bar',
    // Interactive: the destination sheet retargets a fixture draft.
  },
  {
    id: 'ds-20-study-feed',
    title: 'Study feed',
    phase: 'Patterns',
    editFiles: [
      'spa/src/pages/prototype/PrototypeStudyFeedPart.tsx',
      'spa/src/pages/prototype/study-feed-presentation.ts',
      'spa/src/styles/prototype-components.css',
    ],
    screenshotSlug: 'ds-20-study-feed',
    visualBaseline: true,
  },
  {
    id: 'ds-21-welcome-3',
    title: 'Harvous 3 welcome',
    phase: 'Patterns',
    editFiles: [
      'spa/src/pages/prototype/PrototypeWelcome3Sheet.tsx',
      'spa/src/pages/prototype/PrototypeWelcome3.tsx',
      'spa/src/styles/prototype-components.css',
    ],
    screenshotSlug: 'ds-21-welcome-3',
    visualBaseline: true,
  },
  {
    id: 'ds-22-whats-new-row',
    title: "What's new row",
    phase: 'Patterns',
    editFiles: [
      'spa/src/pages/prototype/PrototypeWhatsNewPill.tsx',
      'spa/src/pages/prototype/PrototypeHomeRow.tsx',
    ],
    screenshotSlug: 'ds-22-whats-new-row',
    visualBaseline: true,
  },
];

export function isDesignSystemCoreScene(id: string): boolean {
  return DESIGN_SYSTEM_CORE_SCENES.some((s) => s.id === id);
}
