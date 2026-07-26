import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { resolveJoinHeroImageUrl, resolveJoinHeroPlaceholder } from '../../lib/space-cover-display';
import { loadAuthHeroImage } from '../../utils/random-hero-image';
import type { SpaceCoverAppearance } from '@/utils/space-cover';

export type PublicJoinSpaceHeroSpace = {
  color?: string;
  backgroundGradient?: string;
  cover?: SpaceCoverAppearance;
};

export default function PublicJoinSpaceHero({ space }: { space: PublicJoinSpaceHeroSpace | null }) {
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);

  const heroImageUrl = space ? resolveJoinHeroImageUrl(space, colorScheme) : null;
  const placeholderStyle = resolveJoinHeroPlaceholder(space, colorScheme);
  const imageReady = heroImageUrl !== null && readyUrl === heroImageUrl;

  useEffect(() => {
    if (!heroImageUrl) {
      setReadyUrl(null);
      return undefined;
    }

    let cancelled = false;
    setReadyUrl(null);
    loadAuthHeroImage(heroImageUrl)
      .then(() => {
        if (!cancelled) setReadyUrl(heroImageUrl);
      })
      .catch(() => {
        if (!cancelled) setReadyUrl(heroImageUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [heroImageUrl, colorScheme]);

  // Position/size come from CSS (`.upgrade-hero-bg`, about-dialog overrides) so
  // short heroes can bias the crop — don't pin `backgroundPosition` inline.
  const imageStyle: CSSProperties | undefined = imageReady
    ? {
        backgroundImage: `url("${heroImageUrl}")`,
      }
    : undefined;

  return (
    <div className="upgrade-hero-section" aria-hidden>
      <div className="upgrade-hero-bg upgrade-hero-bg--placeholder" style={placeholderStyle} />
      {heroImageUrl ? (
        <div
          key={heroImageUrl}
          className={`upgrade-hero-bg upgrade-hero-bg--image${imageReady ? ' upgrade-hero-bg--ready' : ''}`}
          style={imageStyle}
        />
      ) : null}
    </div>
  );
}
