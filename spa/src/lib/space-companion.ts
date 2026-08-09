/**
 * How a room names the other room a church has paired it with.
 *
 * The mapping inverts: standing in a **channel**, the companion is the shared
 * space it serves; standing in the **space**, it is the channel. So the glyph
 * and the label describe the room you would land in, never the one you are
 * standing in — which is exactly the pair of values easiest to get backwards,
 * and the reason this is a function with a test rather than a ternary inline in
 * a 1400-line component.
 *
 * The meta names what the other room *is* rather than the relationship: the
 * section's own "Paired with" eyebrow already says that, and repeating it in
 * every row would be the label talking about itself.
 */
import type { CompanionRoom } from '../hooks/queries/useChannelLinks';

export type CompanionToolRow = {
  icon: 'user-group' | 'rss';
  title: string;
  meta: string;
  /** Space ids are stored bare in some payloads and prefixed in others. */
  spaceId: string;
};

export function companionToolRow(
  companion: CompanionRoom | null | undefined,
  viewingMinistryChannel: boolean,
): CompanionToolRow | null {
  if (!companion) return null;
  return {
    icon: viewingMinistryChannel ? 'user-group' : 'rss',
    title: companion.title,
    meta: viewingMinistryChannel ? 'Shared space' : 'Channel',
    spaceId: companion.id.startsWith('space_') ? companion.id : `space_${companion.id}`,
  };
}
