/**
 * The shared note and Thread pages' opening, built on /churches/start's letter: the sign-in sky
 * behind the page, then who shared it as a sentence with their name marked, the way "your
 * church" is marked there. Chosen by Derek (Oct 30 2026) over a small-caps byline above the
 * paper and a glass chip on a full-page sky.
 */
import { useAuthHeroImage } from '../../hooks/useAuthHeroImage';

/** The sign-in sky: a band across the top of the page that fades into the cream paper. */
export function SharedSky() {
  const { heroImage, isReady } = useAuthHeroImage();
  return (
    <div
      className={`public-shared__sky${isReady ? ' public-shared__sky--ready' : ''}`}
      style={isReady ? { backgroundImage: `url(${heroImage})` } : undefined}
      aria-hidden
    />
  );
}

const OPENING_LINE = {
  note: 'shared a note with you.',
  thread: 'shared a thread with you.',
  plan: 'published a study plan.',
} as const;

/** "Derek C. shared a note with you." over the paper, with when if we know it. */
export function SharedOpening({
  name,
  kind,
  date,
  eyebrow,
}: {
  name: string;
  kind: keyof typeof OPENING_LINE;
  date?: string;
  eyebrow?: string;
}) {
  return (
    <div className="public-shared__opening">
      <p className="public-shared__eyebrow">{eyebrow ?? (date ? `Shared ${date}` : 'Shared with you')}</p>
      <h2 className="public-shared__opening-line">
        <span className="public-shared__mark">{name}</span> {OPENING_LINE[kind]}
      </h2>
    </div>
  );
}
