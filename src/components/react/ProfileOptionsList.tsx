import React, { useState, useEffect } from 'react';

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

  const handleOptionClick = (panelName: string, requiresOnline: boolean) => {
    if (requiresOnline && isOffline) {
      return; // Prevent event dispatch when offline
    }
    window.dispatchEvent(new CustomEvent('openProfilePanel', { detail: { panelName } }));
  };

  const renderOption = (
    panelName: string,
    label: string,
    requiresOnline: boolean
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
          <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
            <div className="flex-1 min-w-0 overflow-hidden">
              <span
                className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block"
                style={{ color: 'var(--color-deep-grey)' }}
              >
                {label}
              </span>
            </div>
            <div className="flex items-center justify-center relative shrink-0">
              <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                <div className="flex items-center justify-center relative shrink-0">
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
    <div className="flex flex-col gap-3">
      {/* Content & Activity (most frequently used) */}
      {renderOption('mySpaces', 'My Spaces', true)}
      {renderOption('mySharing', 'My Sharing', true)}
      {renderOption('myAchievements', 'My Achievements', true)}

      {/* Profile & Account Settings */}
      {renderOption('myChurch', 'My Church', true)}
      {renderOption('manageBilling', 'My Subscription', true)}
      {renderOption('referral', 'Refer My Friends', true)}
      {renderOption('editNameColor', 'Edit Name & Color', true)}
      {renderOption('emailPassword', 'Email & Password', true)}
      {renderOption('lockPin', 'Lock PIN', true)}

      {/* Billing & Data Management */}
      {renderOption('myData', 'My Data', true)}
    </div>
  );
}

