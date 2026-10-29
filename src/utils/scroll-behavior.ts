/**
 * `'smooth'` unless the reader asked for less motion. CSS `scroll-behavior` respects the
 * global reduced-motion rule; a `scrollIntoView({ behavior: 'smooth' })` from script does
 * not, so those calls go through this.
 */
export function preferredScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'smooth';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
