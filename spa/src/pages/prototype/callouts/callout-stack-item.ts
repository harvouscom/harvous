import type { CalloutIllustrationKey } from './CalloutIllustration';

/**
 * One card in the callout stack — a feature callout, the legal notice, or one of Harvous's own
 * notices. Each brings its own two answers: what the button does, and what putting it away does.
 */
export interface CalloutStackItem {
  id: string;
  title: string;
  body: string;
  /** The drawing on top of the card; notices have none and draw as a compact card. */
  illustration?: CalloutIllustrationKey;
  actionLabel: string;
  act: () => void;
  dismiss: () => void;
}
