/**
 * A prompt to return to something — the one thing on a day's sheet that looks forward.
 *
 * It used to wear a dashed frame, on the reasoning that an offer should not look like a
 * fact. That was true about the content and wrong about the place: the prompts sit under
 * Suggested beside the daily passage, and a dashed card among filled rows read as a
 * different *kind* of thing rather than a different tense of the same one. One group, one
 * row shape; the eyebrow still says which tense it is.
 *
 * The copy is the recall engine's own (`eyebrow` / `title` / `meta`), so a prompt reads the
 * same on Activity as it does on the sidebar shelf.
 */
import PrototypeHomeRow from './PrototypeHomeRow';
import type { RecallOpportunity } from './PrototypeRecallCarousel';

export default function PrototypeStudyFeedActionCard({
  opportunity,
}: {
  opportunity: RecallOpportunity;
}) {
  return (
    <PrototypeHomeRow
      icon={opportunity.iconName}
      title={opportunity.title}
      /* Eyebrow first: it names the action, which is what the row is offering. The engine's
         own `meta` follows it as the reason. */
      meta={[opportunity.eyebrow, opportunity.meta]}
      onClick={() => opportunity.onOpen()}
    />
  );
}
