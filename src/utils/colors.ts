// Thread color mapping utility
export const THREAD_COLORS = [
  "paper",           // var(--color-paper)
  "blessed-blue",    // var(--color-blessed-blue)
  "graceful-gold",   // var(--color-graceful-gold)
  "caring-coral",    // var(--color-caring-coral)
  "mindful-mint",    // var(--color-mindful-mint)
  "peaceful-pink",   // var(--color-peaceful-pink)
  "pleasant-peach",  // var(--color-pleasant-peach)
  "lovely-lavender"  // var(--color-lovely-lavender)
] as const;

export type ThreadColor = typeof THREAD_COLORS[number];

// Convert thread color name to CSS variable
export function getThreadColorCSS(color: ThreadColor | string | null | undefined): string {
  if (!color) return "var(--color-paper)"; // Paper color for null
  
  const colorMap: Record<string, string> = {
    "paper": "var(--color-paper)",
    "blessed-blue": "var(--color-blessed-blue)",
    "graceful-gold": "var(--color-graceful-gold)",
    "caring-coral": "var(--color-caring-coral)",
    "mindful-mint": "var(--color-mindful-mint)",
    "peaceful-pink": "var(--color-peaceful-pink)",
    "pleasant-peach": "var(--color-pleasant-peach)",
    "lovely-lavender": "var(--color-lovely-lavender)"
  };
  
  return colorMap[color] || "var(--color-paper)";
}

// Convert thread color name to gradient for SpaceButton
export function getThreadGradientCSS(color: ThreadColor | string | null | undefined): string {
  const baseColor = getThreadColorCSS(color);
  return `linear-gradient(180deg, ${baseColor} 0%, ${baseColor} 100%)`;
}

// Get a random thread color (useful for new threads)
export function getRandomThreadColor(): ThreadColor {
  const randomIndex = Math.floor(Math.random() * THREAD_COLORS.length);
  return THREAD_COLORS[randomIndex];
}
