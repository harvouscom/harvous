import React, { useState, useEffect } from 'react';
import { formatBadgeCount } from '@/utils/badge-count';

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
 * 
 * Options that work offline:
 * - Get Support (no API calls)
 */
export default function ProfileOptionsList() {
  // Use browser offline event only — navigator.onLine is unreliable in PWAs
  // (service workers can intercept requests making the browser think it's offline).
  // Default to online (false = not offline) and only go offline on the 'offline' event.
  const [isOffline, setIsOffline] = useState(false);
  const [inboxCount, setInboxCount] = useState<number | null>(null);

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

  // Fetch dismissed featured item count for the "My Inbox" badge.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/featured/dismissed', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        if (!cancelled && Array.isArray(data)) setInboxCount(data.length);
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, []);

  // Refresh badge when user closes My Inbox panel (they may have acted on items).
  useEffect(() => {
    const refresh = (event: Event) => {
      const panelName = (event as CustomEvent).detail?.panelName;
      if (panelName !== 'myInbox') return;
      fetch('/api/featured/dismissed', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: unknown) => {
          if (Array.isArray(data)) setInboxCount(data.length);
        })
        .catch(() => { /* non-fatal */ });
    };
    window.addEventListener('openProfilePanel', refresh);
    return () => window.removeEventListener('openProfilePanel', refresh);
  }, []);

  // Increment badge immediately when a card is dismissed into the inbox.
  useEffect(() => {
    const onDismiss = () => setInboxCount((prev) => (prev ?? 0) + 1);
    window.addEventListener('featuredItemDismissed', onDismiss);
    return () => window.removeEventListener('featuredItemDismissed', onDismiss);
  }, []);

  // Decrement badge immediately when a user erases an inbox item.
  useEffect(() => {
    const onErase = () => setInboxCount((prev) => Math.max(0, (prev ?? 1) - 1));
    window.addEventListener('featuredItemErased', onErase);
    return () => window.removeEventListener('featuredItemErased', onErase);
  }, []);

  const handleOptionClick = (panelName: string, requiresOnline: boolean) => {
    if (requiresOnline && isOffline) {
      return; // Prevent event dispatch when offline
    }
    window.dispatchEvent(new CustomEvent('openProfilePanel', { detail: { panelName } }));
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
          className="space-button relative rounded-3xl h-[64px] transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
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
    </div>
  );
}

