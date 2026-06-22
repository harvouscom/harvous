export const AUTH_HERO_IMAGES = [
  '/images/auth-hero/ai_bg_044.webp',
  '/images/auth-hero/ai_bg_045.webp',
  '/images/auth-hero/ai_bg_047.webp',
  '/images/auth-hero/ai_bg_050.webp',
  '/images/auth-hero/ai_bg_051.webp',
  '/images/auth-hero/ai_bg_053.webp',
  '/images/auth-hero/ai_bg_058.webp',
] as const;

const loadedHeroImages = new Set<string>();
const inflightHeroLoads = new Map<string, Promise<void>>();

export function getRandomHeroImage(): string {
  return AUTH_HERO_IMAGES[Math.floor(Math.random() * AUTH_HERO_IMAGES.length)];
}

function decodeHeroImage(img: HTMLImageElement): Promise<void> {
  if (typeof img.decode === 'function') {
    return img.decode().catch(() => undefined);
  }
  return Promise.resolve();
}

export function loadAuthHeroImage(url: string): Promise<void> {
  if (loadedHeroImages.has(url)) {
    return Promise.resolve();
  }

  const inflight = inflightHeroLoads.get(url);
  if (inflight) {
    return inflight;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      void decodeHeroImage(img).finally(() => {
        loadedHeroImages.add(url);
        inflightHeroLoads.delete(url);
        resolve();
      });
    };
    img.onerror = () => {
      inflightHeroLoads.delete(url);
      reject(new Error(`Failed to load auth hero image: ${url}`));
    };
    img.src = url;
  });

  inflightHeroLoads.set(url, promise);
  return promise;
}

export function preloadAuthHeroImages(): Promise<void> {
  return Promise.all(AUTH_HERO_IMAGES.map((url) => loadAuthHeroImage(url).catch(() => undefined))).then(
    () => undefined
  );
}

void preloadAuthHeroImages();
