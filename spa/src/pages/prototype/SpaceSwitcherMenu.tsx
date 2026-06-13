/**
 * Space switcher orb — Home layer half of the sidebar layer toggle.
 * Tapping switches the sidebar to the Home space view. With My Home as the
 * only space there's no picker menu yet; future spaces/groups add one here.
 */
import { useMemo } from 'react';
import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import { PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';

export default function SpaceSwitcherMenu({
  homeSpaceId,
  authReady,
}: {
  homeSpaceId: string | null;
  authReady: boolean;
}) {
  const { sidebarLayer, setSidebarLayer, ensureSidebarExpanded } = useProtoShell();
  const showShiftHints = usePrototypeShiftHints();

  const normalizedActive = useMemo(
    () =>
      homeSpaceId == null ? null : homeSpaceId.startsWith('space_') ? homeSpaceId : `space_${homeSpaceId}`,
    [homeSpaceId],
  );

  if (!authReady) {
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
    <div className="proto-menu proto-sidebar-toolbar__mode-menu">
      <PrototypeToolbarShortcutItem shortcut="H" showShortcut={showShiftHints}>
        <button
          type="button"
          className="proto-toolbar-icon-btn"
          data-active={sidebarLayer === 'space'}
          title={triggerTitle}
          aria-label={triggerTitle}
          disabled={!hasHome}
          onClick={() => {
            setSidebarLayer('space');
            ensureSidebarExpanded();
          }}
        >
          {triggerIcon}
        </button>
      </PrototypeToolbarShortcutItem>
    </div>
  );
}
