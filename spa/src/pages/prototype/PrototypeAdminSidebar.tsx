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
  prototypeAdminChurchesRouteTo,
  prototypeAdminDiscoverRouteTo,
} from '@/lib/prototype-path';
import { useAdminSupportUnreadCount } from '@/hooks/queries/useAdminSupport';
import { useAdminDiscoverUnreadCount } from '../../hooks/queries/useDiscoverListings';
import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import '@/styles/admin-usage.css';

const NAV = [
  { key: 'usage', label: 'Usage', icon: 'chart-pie' as const, to: prototypeAdminUsageRouteTo() },
  { key: 'pulse', label: 'Pulse', icon: 'heart-pulse' as const, to: prototypeAdminPulseRouteTo() },
  { key: 'reports', label: 'Reports', icon: 'calendar' as const, to: prototypeAdminReportsRouteTo() },
  { key: 'publish', label: 'Publish', icon: 'share' as const, to: prototypeAdminPublishRouteTo() },
  { key: 'churches', label: 'Churches', icon: 'church' as const, to: prototypeAdminChurchesRouteTo() },
  { key: 'support', label: 'Support', icon: 'envelope' as const, to: prototypeAdminSupportRouteTo(), badge: 'support' as const },
  { key: 'discover', label: 'Discover', icon: 'magnifying-glass' as const, to: prototypeAdminDiscoverRouteTo(), badge: 'discover' as const },
  { key: 'maintenance', label: 'Maintenance', icon: 'wrench' as const, to: prototypeAdminMaintenanceRouteTo() },
  { key: 'votd', label: "Today's Passage", icon: 'scroll' as const, to: prototypeAdminVotdRouteTo() },
];

export default function PrototypeAdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobileSidebar } = useProtoShell();
  const supportUnread = useAdminSupportUnreadCount();
  const discoverUnread = useAdminDiscoverUnreadCount();
  /* `badge: true` could only ever mean Support. Naming what each badge counts is
     what lets a second queue have one without the first one's number. */
  const badgeCounts: Record<string, number> = {
    support: supportUnread.data ?? 0,
    discover: discoverUnread.data ?? 0,
  };
  const badgeLabels: Record<string, (n: number) => string> = {
    support: (n) => `${n} unread support ${n === 1 ? 'ticket' : 'tickets'}`,
    discover: (n) => `${n} ${n === 1 ? 'submission' : 'submissions'} waiting`,
  };

  return (
    <div className="proto-sidebar-root">
      {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" admin /> : null}
      <div className="proto-sidebar-scroll">
        <nav className="proto-admin-sidebar__nav" aria-label="Admin sections">
          {NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            const badgeCount = item.badge ? (badgeCounts[item.badge] ?? 0) : 0;
            const showBadge = Boolean(item.badge) && badgeCount > 0;
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
                  {showBadge && item.badge ? (
                    <span
                      className="proto-admin-sidebar__badge"
                      aria-label={badgeLabels[item.badge]?.(badgeCount)}
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
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
