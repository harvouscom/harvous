/**
 * Season Helper Utilities
 * 
 * Handles season detection and formatting for the seasonal XP system.
 * Seasons: Spring (Mar-May), Summer (Jun-Aug), Fall (Sep-Nov), Winter (Dec-Feb)
 */

/**
 * Get current season identifier (e.g., "spring-2025")
 * Winter spans Dec (current year) - Feb (next year), assigned to the year that December belongs to
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  
  if (month >= 3 && month <= 5) return `spring-${year}`;
  if (month >= 6 && month <= 8) return `summer-${year}`;
  if (month >= 9 && month <= 11) return `fall-${year}`;
  // Winter: Dec (current year), Jan, Feb (next year)
  // Assign to the year that December belongs to (so Dec 2025 shows "Winter 2025")
  if (month === 12) return `winter-${year}`; // December belongs to current year's winter
  return `winter-${year - 1}`; // Jan, Feb belong to previous year's winter
}

/**
 * Get formatted season name for display (e.g., "Spring 2025")
 */
export function getSeasonDisplayName(season?: string): string {
  const currentSeason = season || getCurrentSeason();
  const [seasonName, year] = currentSeason.split('-');
  
  const capitalized = seasonName.charAt(0).toUpperCase() + seasonName.slice(1);
  return `${capitalized} ${year}`;
}

/**
 * Get season start date
 */
export function getSeasonStart(season?: string): Date {
  const currentSeason = season || getCurrentSeason();
  const [seasonName, year] = currentSeason.split('-');
  const yearNum = parseInt(year);
  
  let month = 0; // 0-indexed
  if (seasonName === 'spring') month = 2; // March
  else if (seasonName === 'summer') month = 5; // June
  else if (seasonName === 'fall') month = 8; // September
  else {
    // Winter: season identifier is for the year that December belongs to
    // Winter starts in December of that year
    month = 11; // December
    return new Date(yearNum, month, 1); // December of that year
  }
  
  return new Date(yearNum, month, 1);
}

