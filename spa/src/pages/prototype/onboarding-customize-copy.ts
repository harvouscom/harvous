import type { IconName } from '@/components/react/Icon';
import type { OnboardingCustomizeId } from '@/utils/onboarding-state';

export interface OnboardingCustomizeCopy {
  id: OnboardingCustomizeId;
  icon: IconName;
  title: string;
  meta: string;
}

/** "Make it yours" rows under Getting started. */
export const CUSTOMIZE_STEP_COPY: readonly OnboardingCustomizeCopy[] = [
  {
    id: 'reminders',
    icon: 'bell',
    title: 'Turn on reminders',
    meta: 'A verse Sunday morning, a nudge midweek.',
  },
  {
    id: 'appearance',
    icon: 'paintbrush',
    title: 'Pick your look',
    meta: 'Background color or image behind the app.',
  },
  {
    id: 'translation',
    icon: 'scroll',
    title: 'Choose a translation',
    meta: 'The default used when you open the Bible.',
  },
  {
    id: 'import',
    icon: 'cloud-arrow-up',
    title: 'Bring your notes in',
    meta: 'Markdown, Word, Evernote, or a folder of files.',
  },
];
