// Thread color mapping utility
export const THREAD_COLORS = [
  "paper",    // var(--color-paper)
  "blue",     // var(--color-blue)
  "yellow",   // var(--color-yellow)
  "orange",   // var(--color-orange)
  "pink",     // var(--color-pink)
  "purple",   // var(--color-purple)
  "green"     // var(--color-green)
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
// Returns dark grey for all thread colors (pastel colors need dark text)
// Returns dark grey for paper color
export function getThreadTextColorCSS(color: ThreadColor | string | null | undefined): string {
  // All thread colors use dark text (pastel colors)
  return "var(--color-deep-grey)";
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

// Color theory mapping for thread colors
// Maps each color to its OKLCH hue value and optimal position on gradient canvas
interface ColorInfo {
  color: string;
  hue: number; // OKLCH hue value
  position: { x: number; y: number }; // Optimal position on gradient canvas
}

const COLOR_THEORY_MAP: Record<string, ColorInfo> = {
  blue: { color: 'blue', hue: 235, position: { x: 25, y: 20 } },      // Top-left area
  yellow: { color: 'yellow', hue: 90, position: { x: 75, y: 25 } },   // Top-right area
  green: { color: 'green', hue: 145, position: { x: 20, y: 75 } },     // Bottom-left area
  pink: { color: 'pink', hue: 330, position: { x: 80, y: 70 } },      // Bottom-right area
  orange: { color: 'orange', hue: 55, position: { x: 50, y: 15 } },    // Top-center (complementary to blue)
  purple: { color: 'purple', hue: 310, position: { x: 85, y: 30 } },   // Top-right (analogous to pink)
  paper: { color: 'paper', hue: 90, position: { x: 50, y: 50 } },     // Center (neutral)
};

// Simple hash function to convert string to deterministic number
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Generate deterministic but varied offset from base position based on seed
function getVariedPosition(
  basePosition: { x: number; y: number },
  seed: string,
  maxOffset: number = 20 // Maximum offset in percentage
): { x: number; y: number } {
  const hash = hashString(seed);
  
  // Use hash to generate consistent but varied offsets
  // Use different parts of hash for x and y to ensure variation
  const xOffset = ((hash % (maxOffset * 2)) - maxOffset) * 0.8; // -16% to +16%
  const yOffset = (((hash >> 8) % (maxOffset * 2)) - maxOffset) * 0.8; // -16% to +16%
  
  return {
    x: Math.max(5, Math.min(95, basePosition.x + xOffset)),
    y: Math.max(5, Math.min(95, basePosition.y + yOffset)),
  };
}

// Calculate color harmony score between two colors
// Returns: 1.0 = complementary (high harmony), 0.7 = analogous (medium), 0.3 = clashing (low), 0.5 = neutral
function getColorHarmony(color1: string, color2: string): number {
  const info1 = COLOR_THEORY_MAP[color1];
  const info2 = COLOR_THEORY_MAP[color2];
  if (!info1 || !info2) return 0;

  const hueDiff = Math.abs(info1.hue - info2.hue);
  const normalizedDiff = Math.min(hueDiff, 360 - hueDiff) / 180; // 0-1 scale
  
  // Complementary colors (180° apart) = high harmony
  // Analogous colors (close) = medium harmony
  // Clashing colors (90° apart) = low harmony
  if (normalizedDiff > 0.9) return 1.0; // Complementary
  if (normalizedDiff < 0.2) return 0.7; // Analogous
  if (normalizedDiff > 0.4 && normalizedDiff < 0.6) return 0.3; // Clashing (90°)
  return 0.5; // Neutral
}

// Optimize positions based on color relationships
function optimizeColorPositions(
  colors: Array<{ color: string; frequency: number }>,
  seed?: string // Optional seed for deterministic variation (e.g., noteId)
): Array<{ color: string; frequency: number; position: { x: number; y: number } }> {
  const colorInfos = colors.map(({ color, frequency }) => ({
    color,
    frequency,
    info: COLOR_THEORY_MAP[color],
  })).filter(item => item.info); // Filter out invalid colors

  if (colorInfos.length === 0) return [];

  // Sort by frequency (most frequent first)
  colorInfos.sort((a, b) => b.frequency - a.frequency);

  // For 1-2 colors: use their optimal positions with variation
  if (colorInfos.length <= 2) {
    return colorInfos.map(({ color, frequency, info }, index) => {
      const basePosition = info.position;
      // Create seed from color + index + optional seed
      const positionSeed = seed 
        ? `${seed}-${color}-${index}` 
        : `${color}-${frequency}-${index}`;
      
      return {
        color,
        frequency,
        position: seed 
          ? getVariedPosition(basePosition, positionSeed, 25) // Larger variation when seed provided
          : basePosition, // No variation if no seed
      };
    });
  }

  // For 3+ colors: optimize positions to avoid clashing
  const optimized: Array<{ color: string; frequency: number; position: { x: number; y: number } }> = [];
  const usedPositions = new Set<string>();

  for (let i = 0; i < colorInfos.length; i++) {
    const { color, frequency, info } = colorInfos[i];
    // Check if this color has complementary/analogous relationships
    let bestPosition = info.position;
    let minClash = Infinity;

    // Try to place complementary colors opposite each other
    for (const existing of optimized) {
      const harmony = getColorHarmony(color, existing.color);
      
      // If complementary, place opposite
      if (harmony > 0.9) {
        bestPosition = {
          x: 100 - existing.position.x,
          y: 100 - existing.position.y,
        };
        break;
      }
      
      // If analogous, place nearby but not overlapping
      if (harmony > 0.6 && harmony < 0.9) {
        const offset = 15; // Offset by 15% to avoid overlap
        bestPosition = {
          x: Math.max(5, Math.min(95, existing.position.x + offset)),
          y: Math.max(5, Math.min(95, existing.position.y + offset)),
        };
      }
    }

    // Apply deterministic variation based on seed
    if (seed) {
      const positionSeed = `${seed}-${color}-${i}`;
      bestPosition = getVariedPosition(bestPosition, positionSeed, 20);
    }

    // Ensure position isn't too close to existing ones
    const positionKey = `${Math.round(bestPosition.x / 10)}-${Math.round(bestPosition.y / 10)}`;
    if (usedPositions.has(positionKey)) {
      // Find nearest available position
      for (let offset = 10; offset < 50; offset += 10) {
        const candidates = [
          { x: bestPosition.x + offset, y: bestPosition.y },
          { x: bestPosition.x - offset, y: bestPosition.y },
          { x: bestPosition.x, y: bestPosition.y + offset },
          { x: bestPosition.x, y: bestPosition.y - offset },
        ];
        
        for (const candidate of candidates) {
          if (candidate.x >= 5 && candidate.x <= 95 && candidate.y >= 5 && candidate.y <= 95) {
            const key = `${Math.round(candidate.x / 10)}-${Math.round(candidate.y / 10)}`;
            if (!usedPositions.has(key)) {
              bestPosition = candidate;
              break;
            }
          }
        }
      }
    }

    usedPositions.add(positionKey);
    optimized.push({ color, frequency, position: bestPosition });
  }

  return optimized;
}

// Generate a mesh gradient CSS string from thread colors with frequency weighting
// Uses color theory to position colors harmoniously
// Returns null if no valid colors (for fallback to default background)
// Each color gets an optimized position based on color relationships, and frequency increases the radius logarithmically
// Optional seed parameter (e.g., noteId) adds deterministic variation so each note looks unique
export function generateThreadMeshGradient(
  threadColors: Array<{ color: string; frequency: number }>,
  seed?: string // Optional: noteId or other identifier for deterministic variation
): string | null {
  if (!threadColors || threadColors.length === 0) {
    return null;
  }

  // Filter out invalid colors and paper (neutral color doesn't need gradient)
  const validColors = threadColors.filter(
    ({ color }) => color && THREAD_COLORS.includes(color as ThreadColor) && color !== 'paper'
  );

  if (validColors.length === 0) {
    return null;
  }

  // Optimize positions based on color theory with optional seed-based variation
  const optimizedColors = optimizeColorPositions(validColors, seed);

  const gradientCircles: string[] = [];

  for (const { color, frequency, position } of optimizedColors) {
    const cssColor = getThreadColorCSS(color);
    
    // Logarithmic scaling for radius based on frequency
    // Base radius: 40%, then log scale: 40 + log2(frequency) * 15
    // This gives: frequency 1 = 40%, frequency 2 = 55%, frequency 3 = 64%, frequency 4 = 70%, etc.
    const baseRadius = 40;
    const logMultiplier = 15;
    const fadeDistance = baseRadius + (Math.log2(frequency) * logMultiplier);
    
    gradientCircles.push(
      `radial-gradient(circle at ${position.x}% ${position.y}%, ${cssColor} 0%, transparent ${fadeDistance}%)`
    );
  }

  if (gradientCircles.length === 0) {
    return null;
  }

  // Return just the gradients - base color will be set separately via background-color
  return gradientCircles.join(', ');
}
