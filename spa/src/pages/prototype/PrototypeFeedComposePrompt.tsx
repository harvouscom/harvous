/**
 * "What are you studying today?" — the always-visible way to start a note, on Activity.
 *
 * Feedback (Sept 2026): people could not tell where to write. The getting-started checklist
 * teaches it, but only until it is dismissed or done; after that the one way in was the pencil
 * in the toolbar segment, an icon whose name ("New note in My Home") exists only as a hover
 * tooltip — which a phone never shows. Onboarding runs once; this has to be findable on the
 * tenth visit too, so it sits in the page itself, under the greeting, in words.
 *
 * Shaped like a field because that is what a composer prompt is everywhere else, but it is a
 * button: it opens the editor the same way the toolbar pencil does (`prototypeShortcutNewNote`),
 * so the two land a new note in the same space and there is one compose path, not two.
 */
import Icon from '@/components/react/Icon';

export const FEED_COMPOSE_PROMPT = 'What are you studying today?';

export default function PrototypeFeedComposePrompt() {
  return (
    <button
      type="button"
      className="proto-feed-compose"
      onClick={() => window.dispatchEvent(new Event('prototypeShortcutNewNote'))}
    >
      <Icon name="pen-to-square" size={14} aria-hidden />
      <span className="proto-feed-compose__label">{FEED_COMPOSE_PROMPT}</span>
    </button>
  );
}
