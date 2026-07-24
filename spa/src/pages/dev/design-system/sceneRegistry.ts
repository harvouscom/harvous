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
];

export function isDesignSystemCoreScene(id: string): boolean {
  return DESIGN_SYSTEM_CORE_SCENES.some((s) => s.id === id);
}
