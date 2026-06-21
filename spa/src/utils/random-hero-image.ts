const HERO_IMAGES = [
  '/images/auth-hero/ai_bg_044.webp',
  '/images/auth-hero/ai_bg_045.webp',
  '/images/auth-hero/ai_bg_047.webp',
  '/images/auth-hero/ai_bg_050.webp',
  '/images/auth-hero/ai_bg_051.webp',
  '/images/auth-hero/ai_bg_053.webp',
  '/images/auth-hero/ai_bg_058.webp',
];

export function getRandomHeroImage(): string {
  return HERO_IMAGES[Math.floor(Math.random() * HERO_IMAGES.length)];
}
