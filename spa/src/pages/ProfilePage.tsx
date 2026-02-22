import { useUser } from '@clerk/clerk-react';
import { useProfile, useXP } from '../hooks/queries/useProfile';
import CardStack from '../components/CardStack';
import ProfileCardStackHeader from '../../../src/components/react/ProfileCardStackHeader';
import ProfileOptionsList from '../../../src/components/react/ProfileOptionsList';
import { getSeasonDisplayName } from '../../../src/utils/season-helpers';

// Hard-coded month names avoid iOS PWA ignoring the 'en-US' locale hint.
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatJoinDate(date: Date | null | undefined): string {
  if (!date) return '';
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export default function ProfilePageWrapper() {
  const { user } = useUser();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: xp } = useXP();
  // Build initials display: "Derek J" format (first name + last initial)
  const firstName = profile?.firstName ?? user?.firstName ?? '';
  const lastName = profile?.lastName ?? user?.lastName ?? '';
  const initials = `${firstName} ${lastName.charAt(0)}`.trim() || 'User';
  const userColor = profile?.userColor ?? 'blue';
  const joinDate = formatJoinDate(user?.createdAt);
  const seasonalXP = xp?.seasonalXP ?? 0;
  const seasonName = getSeasonDisplayName();

  // Render the card shell immediately — avoids a hard layout swap while profile loads.
  // Content fades in once both Clerk user and profile data are ready.
  const contentReady = !profileLoading && !!user;

  return (
    <div className="page-flex-column">
      {/* Main CardStack */}
      <div className="page-flex-column__main">
        <CardStack
          headerBgColor={`var(--color-${userColor})`}
          centerTitle
          id="profile-cardstack"
          header={
            <ProfileCardStackHeader
              initialColor={userColor}
              initialDisplayName="My Profile"
            />
          }
        >
          <div className={contentReady ? 'content-fade-in' : undefined}>
            {/* Info cards: joined date + XP */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {/* Joined Date */}
              <div style={{ backgroundColor: 'white', border: '1px solid var(--color-fog-white)', borderRadius: '12px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg style={{ width: '16px', height: '16px', fill: 'var(--color-deep-grey)', flexShrink: 0 }} viewBox="0 0 448 512">
                  <path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z" />
                </svg>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-deep-grey)' }}>{joinDate}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-pebble-grey)' }}>Joined</div>
                </div>
              </div>

              {/* XP */}
              <div style={{ backgroundColor: 'white', border: '1px solid var(--color-fog-white)', borderRadius: '12px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg style={{ width: '16px', height: '16px', fill: 'var(--color-deep-grey)', flexShrink: 0 }} viewBox="0 0 448 512">
                  <path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z" />
                </svg>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-deep-grey)' }}>{seasonalXP} XP</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-pebble-grey)' }}>{seasonName}</div>
                </div>
              </div>
            </div>

            {/* Settings options list */}
            <ProfileOptionsList />

            {/* Bottom: Get Support + About */}
            <div style={{ marginTop: 'auto', paddingTop: '12px', paddingBottom: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                onClick={() => window.dispatchEvent(new CustomEvent('openProfilePanel', { detail: { panelName: 'getSupport' } }))}
                style={{ width: '100%', cursor: 'pointer' }}
              >
                <div className="space-button" style={{ position: 'relative', borderRadius: '1.5rem', height: '64px', padding: '0 0 0 1rem', width: '100%', backgroundImage: 'var(--color-gradient-gray)', display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%', paddingLeft: '8px', minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '18px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', color: 'var(--color-deep-grey)' }}>Get Support</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '12px' }}>
                      <svg style={{ width: '24px', height: '24px', fill: 'var(--color-pebble-grey)' }} viewBox="0 0 320 512"><path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z" /></svg>
                    </div>
                  </div>
                </div>
              </div>

              <div
                onClick={() => window.dispatchEvent(new CustomEvent('openProfilePanel', { detail: { panelName: 'aboutHarvous' } }))}
                style={{ width: '100%', cursor: 'pointer' }}
              >
                <div className="space-button" style={{ position: 'relative', borderRadius: '1.5rem', height: '64px', padding: '0 0 0 1rem', width: '100%', backgroundImage: 'var(--color-gradient-gray)', display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%', paddingLeft: '8px', minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '18px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', color: 'var(--color-deep-grey)' }}>Letter from the Founder</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '12px' }}>
                      <svg style={{ width: '24px', height: '24px', fill: 'var(--color-pebble-grey)' }} viewBox="0 0 320 512"><path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z" /></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="profile-logout-spacer" />
        </CardStack>
      </div>
    </div>
  );
}
