import { useEffect, useMemo, useState } from 'react';
import { getRandomHeroImage, loadAuthHeroImage } from '../utils/random-hero-image';

export function useAuthHeroImage() {
  const heroImage = useMemo(() => getRandomHeroImage(), []);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadAuthHeroImage(heroImage)
      .then(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [heroImage]);

  return { heroImage, isReady };
}
