import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatBadgeCount } from '@/utils/badge-count';
import { safeNavigate } from '@/utils/safe-navigate';
import {
  useFeaturedDismissed,
  featuredDismissedQueryPrefix,
} from '../../../spa/src/hooks/queries/useFeaturedDismissed';

/**
 * ProfileOptionsList - React component that renders profile options
 * and disables options that require online connectivity when offline.
 * 
 * Options requiring online:
 * - My Spaces (fetches data)
 * - My Achievements (fetches data)
 * - My Church (updates via API)
 * - Edit Name & Color (updates via API)
 * - Email & Password (updates via API)
 * - My Subscription (uses Clerk billing)
 * - My Data (export/import/delete operations)
 * - Today's Passage (admin) (API)
 * 
 * Options that work offline:
 * - Get Support (no API calls)
 */
export default function ProfileOptionsList() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { data: dismissedItems } = useFeaturedDismissed({ enabled: !!user?.id });
  const inboxCount = dismissedItems?.length ?? null;
  // Use browser offline event only — navigator.onLine is unreliable in PWAs
  // (service workers can intercept requests making the browser think it's offline).
  // Default to online (false = not offline) and only go offline on the 'offline' event.
  const [isOffline, setIsOffline] = useState(false);
  const [isHarvousAdmin, setIsHarvousAdmin] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsHarvousAdmin(false);
    if (!user?.id) return () => { cancelled = true; };
    fetch('/api/admin/check', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { isAdmin: false }))
      .then((data: { isAdmin?: boolean }) => {
        if (!cancelled) setIsHarvousAdmin(data?.isAdmin === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Keep badge in sync when featured cards move in/out of the inbox (shared React Query cache).
  useEffect(() => {
    const onDismiss = () => {
      void queryClient.invalidateQueries({ queryKey: [...featuredDismissedQueryPrefix] });
    };
    const onErase = () => {
      void queryClient.invalidateQueries({ queryKey: [...featuredDismissedQueryPrefix] });
    };
    window.addEventListener('featuredItemDismissed', onDismiss);
    window.addEventListener('featuredItemErased', onErase);
    return () => {
      window.removeEventListener('featuredItemDismissed', onDismiss);
      window.removeEventListener('featuredItemErased', onErase);
    };
  }, [queryClient]);

  const handleOptionClick = (panelName: string, requiresOnline: boolean) => {
    if (requiresOnline && isOffline) {
      return; // Prevent event dispatch when offline
    }
    window.dispatchEvent(new CustomEvent('openProfilePanel', { detail: { panelName } }));
  };

  const handleAdminNavClick = (path: string, requiresOnline: boolean) => {
    if (requiresOnline && isOffline) return;
    void safeNavigate(path);
  };

  const renderAdminNavOption = (path: string, label: string, requiresOnline: boolean) => {
    const disabled = requiresOnline && isOffline;
    return (
      <div
        onClick={() => handleAdminNavClick(path, requiresOnline)}
        className="w-full"
        style={{
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      >
        <div
          className="space-button relative rounded-3xl h-[64px] transition-[scale,shadow] duration-200 pl-4 pr-0 w-full"
          style={{ backgroundImage: 'var(--color-gradient-gray)' }}
        >
          <div className="flex-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
            <div className="flex-fill overflow-hidden">
              <span className="panel__list-item-label" style={{ color: 'var(--color-deep-grey)' }}>
                {label}
              </span>
            </div>
            <div className="flex-center relative shrink-0" style={{ gap: '8px' }}>
              <div className="panel__list-item-icon-wrapper">
                <div className="flex-center relative shrink-0">
                  <div className="relative w-6 h-6">
                    <svg
                      className="fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125"
                      viewBox="0 0 320 512"
                    >
                      <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderOption = (
    panelName: string,
    label: string,
    requiresOnline: boolean,
    badge?: number | null
  ) => {
    const disabled = requiresOnline && isOffline;
    
    return (
      <div
        onClick={() => handleOptionClick(panelName, requiresOnline)}
        className="w-full"
        style={{
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          pointerEvents: disabled ? 'none' : 'auto'
        }}
      >
        <div
          className="space-button relative rounded-3xl h-[64px] transition-[scale,shadow] duration-200 pl-4 pr-0 w-full"
          style={{ backgroundImage: 'var(--color-gradient-gray)' }}
        >
          <div className="flex-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
            <div className="flex-fill overflow-hidden">
              <span
                className="panel__list-item-label"
                style={{ color: 'var(--color-deep-grey)' }}
              >
                {label}
              </span>
            </div>
            <div className="flex-center relative shrink-0" style={{ gap: '8px' }}>
              {badge != null && badge > 0 ? (
                <div className="badge-count">
                  <span className="badge-number">{formatBadgeCount(badge)}</span>
                </div>
              ) : null}
              <div className="panel__list-item-icon-wrapper">
                <div className="flex-center relative shrink-0">
                  <div className="relative w-6 h-6">
                    <svg
                      className="fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125"
                      viewBox="0 0 320 512"
                    >
                      <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-stack">
      {/* Content & Activity (most frequently used) */}
      {renderOption('myInbox', 'My Inbox', true, inboxCount)}
      {renderOption('mySpaces', 'My Spaces', true)}
      {renderOption('mySharing', 'My Sharing', true)}
      {renderOption('myAchievements', 'My Achievements', true)}

      {/* Profile & Account Settings */}
      {renderOption('myPreferences', 'My Preferences', true)}
      {renderOption('referral', 'Refer My Friends', true)}
      {renderOption('editNameColor', 'Edit Name & Color', true)}
      {renderOption('emailPassword', 'Email & Password', true)}

      {/* Billing & Data Management */}
      {renderOption('myData', 'My Data', true)}
      {isHarvousAdmin ? renderOption('adminVotd', "Today's Passage", true) : null}
      {isHarvousAdmin ? renderAdminNavOption('/admin/pulse', 'Pulse', true) : null}
      {isHarvousAdmin ? renderAdminNavOption('/admin/usage', 'Usage dashboard', true) : null}
      {isHarvousAdmin ? renderAdminNavOption('/admin/publish', 'Publish', true) : null}
      {isHarvousAdmin ? renderAdminNavOption('/admin/maintenance', 'Maintenance', true) : null}
      {isHarvousAdmin ? renderAdminNavOption('/admin/support', 'Support', true) : null}
    </div>
  );
}

