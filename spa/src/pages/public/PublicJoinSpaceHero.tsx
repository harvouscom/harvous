import { useEffect, useState, useSyncExternalStore } from 'react';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { resolveJoinHeroBackground, resolveJoinHeroImageUrl } from '../../lib/space-cover-display';
import { loadAuthHeroImage } from '../../utils/random-hero-image';
import type { SpaceCoverAppearance } from '@/utils/space-cover';

const JOIN_HERO_FALLBACK = '/images/auth-hero/ai_bg_045.webp';

export type PublicJoinSpaceHeroSpace = {
  color?: string;
  backgroundGradient?: string;
  cover?: SpaceCoverAppearance;
};

export default function PublicJoinSpaceHero({ space }: { space: PublicJoinSpaceHeroSpace | null }) {
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);
  const [isReady, setIsReady] = useState(false);

  const heroImageUrl = space ? resolveJoinHeroImageUrl(space, colorScheme) : null;
  const heroStyle = space ? resolveJoinHeroBackground(space, colorScheme) : { backgroundImage: `url("${JOIN_HERO_FALLBACK}")` };

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    const preloadUrl = heroImageUrl ?? (space ? null : JOIN_HERO_FALLBACK);
    if (!preloadUrl) {
      setIsReady(true);
      return undefined;
    }
    loadAuthHeroImage(preloadUrl)
      .then(() => !cancelled && setIsReady(true))
      .catch(() => !cancelled && setIsReady(true));
    return () => {
      cancelled = true;
    };
  }, [heroImageUrl, space, colorScheme]);

  return (
    <div className="upgrade-hero-section" aria-hidden>
      <div
        className={`upgrade-hero-bg${isReady ? ' upgrade-hero-bg--ready' : ''}`}
        style={isReady ? heroStyle : undefined}
      />
    </div>
  );
}
