import { Link, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import {
  prototypeAdminUsageRouteTo,
  prototypeAdminReportsRouteTo,
  prototypeAdminVotdRouteTo,
  prototypeAdminPulseRouteTo,
  prototypeAdminPublishRouteTo,
  prototypeAdminMaintenanceRouteTo,
  prototypeAdminSupportRouteTo,
} from '@/lib/prototype-path';
import { useAdminSupportUnreadCount } from '@/hooks/queries/useAdminSupport';
import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import '@/styles/admin-usage.css';

const NAV = [
  { key: 'usage', label: 'Usage', icon: 'chart-pie' as const, to: prototypeAdminUsageRouteTo() },
  { key: 'pulse', label: 'Pulse', icon: 'heart-pulse' as const, to: prototypeAdminPulseRouteTo() },
  { key: 'reports', label: 'Reports', icon: 'calendar' as const, to: prototypeAdminReportsRouteTo() },
  { key: 'publish', label: 'Publish', icon: 'share' as const, to: prototypeAdminPublishRouteTo() },
  { key: 'support', label: 'Support', icon: 'envelope' as const, to: prototypeAdminSupportRouteTo(), badge: true },
  { key: 'maintenance', label: 'Maintenance', icon: 'wrench' as const, to: prototypeAdminMaintenanceRouteTo() },
  { key: 'votd', label: "Today's Passage", icon: 'scroll' as const, to: prototypeAdminVotdRouteTo() },
];

export default function PrototypeAdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobileSidebar } = useProtoShell();
  const unreadCount = useAdminSupportUnreadCount();

  return (
    <div className="proto-sidebar-root">
      {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" admin /> : null}
      <div className="proto-sidebar-scroll">
        <nav className="proto-admin-sidebar__nav" aria-label="Admin sections">
          {NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            const unreadTickets = unreadCount.data ?? 0;
            const showSupportBadge = item.badge && unreadTickets > 0;
            return (
              <Link
                key={item.key}
                to={item.to}
                className="proto-settings__nav-item"
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
              >
                <span
                  className={`proto-settings__nav-icon${item.badge ? ' proto-admin-sidebar__nav-icon-wrap' : ''}`}
                  aria-hidden
                >
                  <Icon name={item.icon} size={15} />
                  {showSupportBadge ? (
                    <span
                      className="proto-admin-sidebar__badge"
                      aria-label={`${unreadTickets} unread support ${unreadTickets === 1 ? 'ticket' : 'tickets'}`}
                    >
                      {unreadTickets > 99 ? '99+' : unreadTickets}
                    </span>
                  ) : null}
                </span>
                <span className="proto-settings__nav-title">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
