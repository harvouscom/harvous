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
  orange: { color: 'orange', hue: 70, position: { x: 50, y: 15 } },    // Top-center (Peach)
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

// Generate multiple hash values from a seed for independent randomization
function generateHashVariants(seed: string): { hash1: number; hash2: number; hash3: number } {
  const baseHash = hashString(seed);
  // Create variations by hashing different parts of the seed
  const hash1 = baseHash;
  const hash2 = hashString(seed + '-x');
  const hash3 = hashString(seed + '-y');
  return { hash1, hash2, hash3 };
}

// Generate deterministic but varied offset from base position based on seed
// Enhanced with rotation/angle component and larger variation range
function getVariedPosition(
  basePosition: { x: number; y: number },
  seed: string,
  maxOffset: number = 37 // Maximum offset in percentage (increased from 20)
): { x: number; y: number } {
  const { hash1, hash2, hash3 } = generateHashVariants(seed);
  
  // Generate angle for rotation-based positioning (0-360 degrees)
  const angle = (hash1 % 360) * (Math.PI / 180); // Convert to radians
  
  // Generate distance from base position (0 to maxOffset)
  const distance = ((hash2 % 100) / 100) * maxOffset;
  
  // Calculate x and y offsets using polar coordinates (rotation)
  const xOffset = Math.cos(angle) * distance;
  const yOffset = Math.sin(angle) * distance;
  
  // Add additional independent variation using hash3 for more randomness
  const independentX = ((hash3 % (maxOffset * 2)) - maxOffset) * 0.3;
  const independentY = (((hash3 >> 8) % (maxOffset * 2)) - maxOffset) * 0.3;
  
  return {
    x: Math.max(5, Math.min(95, basePosition.x + xOffset + independentX)),
    y: Math.max(5, Math.min(95, basePosition.y + yOffset + independentY)),
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
          ? getVariedPosition(basePosition, positionSeed, 38) // Increased variation (35-40% range)
          : getVariedPosition(basePosition, positionSeed, 15), // Apply some variation even without seed
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
      
      // If analogous, place nearby but not overlapping (increased spread)
      if (harmony > 0.6 && harmony < 0.9) {
        const offset = 28; // Increased offset by 25-30% for more spread
        bestPosition = {
          x: Math.max(5, Math.min(95, existing.position.x + offset)),
          y: Math.max(5, Math.min(95, existing.position.y + offset)),
        };
      }
    }

    // Apply deterministic variation based on seed (with larger range)
    // Always apply variation when seed is provided, with larger range for more randomization
    const positionSeed = seed 
      ? `${seed}-${color}-${i}` 
      : `${color}-${frequency}-${i}`;
    bestPosition = seed 
      ? getVariedPosition(bestPosition, positionSeed, 37) // Increased variation (35-40% range)
      : getVariedPosition(bestPosition, positionSeed, 12); // Apply some variation even without seed

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
