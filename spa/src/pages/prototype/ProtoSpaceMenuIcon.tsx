/**
 * Shared space row icon for prototype menus — accent tile + user-group glyph
 * (matches join invite letter via `.space-icon-tile`; replaces the old color dot).
 */
import { useSyncExternalStore } from 'react';
import Icon from '@/components/react/Icon';
import { spaceIconAccentHex } from '@/utils/space-cover';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';

/** Fills the 16px menu icon slot — optically matches `ProtoHouseIcon` at 15px. */
const DEFAULT_SIZE = PROTO_TOOLBAR_ICON_SIZE + 1;

export default function ProtoSpaceMenuIcon({
  color = 'paper',
  size = DEFAULT_SIZE,
  radius,
  glyphSize,
}: {
  color?: string;
  size?: number;
  /** Corner radius override (px); defaults to the menu tile's 4px via CSS. */
  radius?: number;
  /** Glyph size override (px). Defaults to the menu-tuned 0.625 ratio; pass a
   *  smaller value (e.g. ~0.42 of the tile) to match the join letter proportion. */
  glyphSize?: number;
}) {
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);
  const iconSize = glyphSize ?? Math.max(9, Math.round(size * 0.625));
  const accent = spaceIconAccentHex(color, colorScheme);
  const onDark = colorScheme === 'dark';

  return (
    <span
      className={`proto-space-menu-icon space-icon-tile${onDark ? ' space-icon-tile--on-dark' : ''}`}
      aria-hidden
      style={{
        width: size,
        height: size,
        ...(radius != null ? { borderRadius: radius } : null),
        ['--space-icon-accent' as string]: accent,
      }}
    >
      <Icon name="user-group" size={iconSize} />
    </span>
  );
}
