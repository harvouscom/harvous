/**
 * Note template list icon — same glyph for every template; color is per-template.
 */
import { getBuiltInTemplates } from '@/data/note-templates';
import { THREAD_COLORS, USER_AVATAR_COLORS, type ThreadColor } from '@/utils/colors';

/** Glyph used in browse list + save preview (matches Templates inspector affordance). */
export const NOTE_TEMPLATE_ICON_NAME = 'list-check' as const;

/** Colors offered when saving a custom template. */
export const NOTE_TEMPLATE_ICON_COLORS = USER_AVATAR_COLORS;

export function isNoteTemplateIconColor(value: unknown): value is ThreadColor {
  return (
    typeof value === 'string' &&
    (THREAD_COLORS as readonly string[]).includes(value) &&
    value !== 'paper'
  );
}

/** Deterministic fallback when a stored template has no iconColor yet. */
export function hashNoteTemplateIconColor(id: string): ThreadColor {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return NOTE_TEMPLATE_ICON_COLORS[h % NOTE_TEMPLATE_ICON_COLORS.length]!;
}

export function resolveNoteTemplateIconColor(
  id: string,
  iconColor?: string | null,
): ThreadColor {
  if (isNoteTemplateIconColor(iconColor)) return iconColor;
  const builtIn = getBuiltInTemplates().find((t) => t.id === id)?.iconColor;
  if (builtIn) return builtIn;
  return hashNoteTemplateIconColor(id);
}
