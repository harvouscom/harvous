import { Link, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import {
  prototypeAdminUsageRouteTo,
  prototypeAdminVotdRouteTo,
} from '@/lib/prototype-path';
import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import '@/styles/admin-usage.css';

const NAV = [
  { key: 'usage', label: 'Usage', icon: 'chart-pie' as const, to: prototypeAdminUsageRouteTo() },
  { key: 'votd', label: "Today's Passage", icon: 'scroll' as const, to: prototypeAdminVotdRouteTo() },
];

export default function PrototypeAdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobileSidebar } = useProtoShell();

  return (
    <div className="proto-sidebar-root">
      {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" admin /> : null}
      <div className="proto-sidebar-scroll">
        <nav className="proto-admin-sidebar__nav" aria-label="Admin sections">
          {NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.key}
                to={item.to}
                className="proto-settings__nav-item"
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
              >
                <span className="proto-settings__nav-icon" aria-hidden>
                  <Icon name={item.icon} size={15} />
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
