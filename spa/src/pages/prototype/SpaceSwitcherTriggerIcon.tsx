/**
 * What a space switcher's trigger shows: the place you are in, as one glyph.
 *
 * Four cases, in priority order — a ministry channel's tile, a shared space's tile, the
 * church glyph in My Church, the house in My Home. Extracted because the switcher now has
 * two triggers in two different surfaces (the sidebar's segmented half and the toolbar's
 * Activity segment), and a second copy of this chain would drift: the first thing to go
 * would be My Home, which is the case that is easiest to forget because it is the fallback.
 */
import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import type { NavSpace } from '../../hooks/queries/useNavigation';

export function SpaceSwitcherTriggerIcon({
  space,
  isMinistry,
  inSharedSpace,
  inMyChurchMode,
  hasHome,
  glyphSize,
  tileSize,
}: {
  space: NavSpace | null | undefined;
  isMinistry: boolean;
  /** A shared space is active *and* has resolved a title to show. */
  inSharedSpace: boolean;
  inMyChurchMode: boolean;
  hasHome: boolean;
  /** Bare glyphs (house, church) — drawn to the tile's block so the hubs match. */
  glyphSize: number;
  /** Colour tiles. Omit to take `ProtoSpaceMenuIcon`'s own default. */
  tileSize?: number;
}) {
  if (isMinistry) {
    return <ProtoSpaceMenuIcon color={space?.color || 'paper'} iconName="rss" size={tileSize} />;
  }
  if (inSharedSpace) {
    return <ProtoSpaceMenuIcon color={space?.color || 'paper'} size={tileSize} />;
  }
  if (inMyChurchMode) {
    return <Icon name="church" size={glyphSize} aria-hidden />;
  }
  if (hasHome) {
    return <ProtoHouseIcon size={glyphSize} />;
  }
  /* Nav has not resolved a home yet — a neutral grid rather than a house that might be
     about to become a church. */
  return <Icon name="table-cells" size={glyphSize} aria-hidden />;
}
