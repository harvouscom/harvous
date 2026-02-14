import { useUser } from '@clerk/clerk-react';
import { useProfile, useXP } from '../hooks/queries/useProfile';
import { useNavigation } from '../hooks/queries/useNavigation';
import ProfilePage from '../../../src/components/react/profile/ProfilePage';

export default function ProfilePageWrapper() {
  const { user } = useUser();
  const { data: profile } = useProfile();
  const { data: xp } = useXP();
  const { data: nav } = useNavigation();

  if (!profile || !user) {
    return <div className="page-loading" />;
  }

  const allSpaces = [
    ...(nav?.spaces ?? []),
    ...(nav?.memberOfSpaces ?? []),
  ].map(s => ({
    id: s.id,
    title: s.title,
    backgroundGradient: s.backgroundGradient,
    totalItemCount: 0,
    isPublic: false,
  }));

  const memberOfIds = (nav?.memberOfSpaces ?? []).map(s => s.id);

  return (
    <ProfilePage
      displayName={profile.displayName}
      userColor={profile.userColor}
      joinDate={user.createdAt?.toISOString() ?? new Date().toISOString()}
      firstName={profile.firstName ?? ''}
      lastName={profile.lastName ?? ''}
      seasonalXP={xp?.seasonXP}
      lifetimeXP={xp?.lifetimeXP}
      spaces={allSpaces}
      initialMemberOfIds={memberOfIds}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
    />
  );
}
