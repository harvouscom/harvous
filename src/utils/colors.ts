// Thread color mapping utility
export const THREAD_COLORS = [
  "paper",    // var(--color-paper)
  "blue",     // var(--color-blue)
  "yellow",   // var(--color-yellow)
  "green",    // var(--color-green)
  "pink",     // var(--color-pink)
  "orange",   // var(--color-orange)
  "purple"    // var(--color-purple)
] as const;

export type ThreadColor = typeof THREAD_COLORS[number];

// Convert thread color name to CSS variable
export function getThreadColorCSS(color: ThreadColor | string | null | undefined): string {
  if (!color) return "var(--color-paper)"; // Paper color for null
  
  const colorMap: Record<string, string> = {
    "paper": "var(--color-paper)",
    "blue": "var(--color-blue)",
    "yellow": "var(--color-yellow)",
    "green": "var(--color-green)",
    "pink": "var(--color-pink)",
    "orange": "var(--color-orange)",
    "purple": "var(--color-purple)"
  };
  
  return colorMap[color] || "var(--color-paper)";
}

// Get appropriate text color for thread color backgrounds
// Returns white for thread colors (blue, yellow, green, pink, orange, purple)
// Returns dark grey for paper color
export function getThreadTextColorCSS(color: ThreadColor | string | null | undefined): string {
  if (!color || color === "paper") {
    return "var(--color-deep-grey)";
  }
  
  // All other thread colors should have white text
  return "white";
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
