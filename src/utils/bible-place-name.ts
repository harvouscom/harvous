/**
 * OpenBible's geocoding disambiguates places that share a name with a trailing number
 * ("Bethlehem 1", "Judea 2", "Babylon 1"). The canonical registry keeps that suffix (the places
 * are genuinely distinct), but anything user-facing — tags, folders, the cached payload — should
 * show the plain name. Shared by the client suggesters and the server knowledge layer.
 */
export function normalizePlaceName(name: string): string {
  return name.replace(/\s+\d+$/, '').trim();
}
