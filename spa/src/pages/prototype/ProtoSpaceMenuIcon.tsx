/**
 * Space row icon for prototype menus — accent tile + glyph
 * (matches join invite letter via `.space-icon-tile`; replaces the old color dot).
 * Shared Spaces use `user-group`; ministry channels pass `rss`.
 */
import { useSyncExternalStore } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
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
  variant = 'menu',
  iconName = 'user-group',
}: {
  color?: string;
  size?: number;
  /** Corner radius override (px); defaults to the menu tile's 4px via CSS. */
  radius?: number;
  /** Glyph size override (px). Defaults to the menu-tuned 0.625 ratio; pass a
   *  smaller value (e.g. ~0.42 of the tile) to match the join letter proportion. */
  glyphSize?: number;
  /** `orb` fills the toolbar circle edge-to-edge; `menu` is the compact menu row tile. */
  variant?: 'menu' | 'orb';
  /** Glyph inside the color tile. Default people icon; ministry channels use `rss`. */
  iconName?: IconName;
}) {
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);
  const isOrb = variant === 'orb';
  const tileSize = isOrb ? undefined : size;
  const iconSize = glyphSize ?? (isOrb ? 13 : Math.max(9, Math.round(size * 0.625)));
  const accent = spaceIconAccentHex(color, colorScheme);
  const onDark = colorScheme === 'dark';

  return (
    <span
      className={`proto-space-menu-icon space-icon-tile${onDark ? ' space-icon-tile--on-dark' : ''}${isOrb ? ' proto-space-menu-icon--orb' : ''}`}
      aria-hidden
      style={{
        ...(tileSize != null ? { width: tileSize, height: tileSize } : null),
        ...(radius != null && !isOrb ? { borderRadius: radius } : null),
        ['--space-icon-accent' as string]: accent,
      }}
    >
      <Icon name={iconName} size={iconSize} />
    </span>
  );
}
