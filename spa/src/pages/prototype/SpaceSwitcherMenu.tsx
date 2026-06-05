/**
 * Space switcher — prototype is My Home only; other spaces are retired in this shell.
 * Always shows the home orb once nav is ready; static glyph (no dropdown) in all cases.
 */
import { useMemo } from 'react';
import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';

export default function SpaceSwitcherMenu({ homeSpaceId, navReady }: { homeSpaceId: string | null; navReady: boolean }) {
  const { data: nav } = useNavigation();

  const normalizedActive = useMemo(
    () =>
      homeSpaceId == null ? null : homeSpaceId.startsWith('space_') ? homeSpaceId : `space_${homeSpaceId}`,
    [homeSpaceId],
  );

  if (!navReady) {
    return null;
  }

  const hasHome = Boolean(normalizedActive);
  const triggerTitle = hasHome ? 'My Home' : 'No My Home yet — finish setup in the classic app';
  const triggerIcon = hasHome ? (
    <ProtoHouseIcon size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
  ) : (
    <Icon name="table-cells" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
  );

  return (
    <div className="proto-menu">
      <span className="proto-space-trigger proto-space-trigger--static" title={triggerTitle} aria-label={triggerTitle}>
        {triggerIcon}
      </span>
    </div>
  );
}
