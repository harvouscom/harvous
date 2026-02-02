import React, { useState, useEffect } from 'react';
import { toast } from '@/utils/toast';
import { clearCachedProfileData, updateCachedProfileData, getCachedProfileData } from '@/utils/profile-cache';

// Import panel components
import EditNameColorPanel from '@/components/react/EditNameColorPanel';
import EmailPasswordPanel from '@/components/react/EmailPasswordPanel';
import MyDataPanel from '@/components/react/MyDataPanel';
import MyChurchPanel from '@/components/react/MyChurchPanel';
import MySpacesPanel from '@/components/react/MySpacesPanel';
import MyAchievementsPanel from '@/components/react/MyAchievementsPanel';
import GetSupportPanel from '@/components/react/GetSupportPanel';
import ManageBillingPanel from '@/components/react/ManageBillingPanel';
import ReferralPanel from '@/components/react/ReferralPanel';
import AboutHarvousPanel from '@/components/react/AboutHarvousPanel';
import LockPinPanel from '@/components/react/LockPinPanel';

// Type definitions for props
export interface ProfilePageProps {
  displayName: string;
  userColor: string;
  joinDate: string;
  userXP?: number; // Legacy - kept for backward compatibility
  firstName: string;
  lastName: string;
  seasonalXP?: number;
  lifetimeXP?: number;
  seasonName?: string;
  version?: string;
  publishableKey?: string | null;
  spaces?: Array<{
    id: string;
    title: string;
    color?: string;
    backgroundGradient?: string;
    totalItemCount: number;
    isPublic?: boolean;
  }>;
  churchData?: {
    churchName: string | null;
    churchCity: string | null;
    churchState: string | null;
  };
  founderLetterHtml?: string;
}

// Type definition for a panel name
type PanelName = 'editNameColor' | 'emailPassword' | 'myChurch' | 'mySpaces' | 'myData' | 'myAchievements' | 'getSupport' | 'manageBilling' | 'referral' | 'aboutHarvous' | 'lockPin' | null;

const ProfilePage: React.FC<ProfilePageProps> = ({
  displayName,
  userColor,
  joinDate,
  userXP,
  firstName,
  lastName,
  version,
  spaces = [],
  churchData,
  publishableKey = null,
  founderLetterHtml = '',
}) => {
  const [activePanel, setActivePanel] = useState<PanelName>(null);
  const [panelOpenTime, setPanelOpenTime] = useState<number>(0);
  const [profileData, setProfileData] = useState({
    displayName,
    userColor,
    firstName,
    lastName,
    initials: `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase(),
  });

  const handleLogout = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    
    try {
      // Clear local storage before sign-out
      sessionStorage.removeItem('userProfileData');
      
      // Clear unified profile cache
      clearCachedProfileData();
      
      // Use Clerk's built-in signOut with redirectUrl
      // This handles the sign-out and redirect automatically
      // @ts-ignore
      if (window.Clerk && window.Clerk.signOut) {
        // @ts-ignore
        await window.Clerk.signOut({ redirectUrl: '/sign-in' });
      } else {
        // Fallback if Clerk isn't loaded
        window.location.href = '/sign-in';
      }
    } catch (error) {
      console.error('Logout failed:', error);
      // Fallback redirect on error
      window.location.href = '/sign-in';
    }
  };

  const handleProfileUpdateRequest = async (detail: { firstName: string; lastName: string; color: string; }) => {
    try {
      const { firstName, lastName, color } = detail;
      
      const response = await fetch('/api/user/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName,
          lastName,
          color
        })
      });

      const data = await response.json();

      if (response.ok) {
        const newInitials = `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase();
        const newDisplayName = `${firstName} ${lastName.charAt(0)}`.trim();

        setProfileData({
            displayName: newDisplayName,
            userColor: color,
            firstName,
            lastName,
            initials: newInitials
        });

        // ProfileCardStackHeader component will handle header updates via updateProfile event

        // @ts-ignore
        if (window.updateAllAvatars) {
            // @ts-ignore
            await window.updateAllAvatars(color, newInitials);
        }
        
        // Update unified cache
        updateCachedProfileData({
          firstName,
          lastName,
          userColor: color
        });
        
        // Also update legacy sessionStorage for backward compatibility
        sessionStorage.setItem('userProfileData', JSON.stringify({
          firstName,
          lastName,
          color,
          initials: newInitials,
          displayName: newDisplayName,
          timestamp: Date.now()
        }));

        // Wait to ensure data persistence before showing toast
        await new Promise(resolve => setTimeout(resolve, 250));

      } else {
        console.error('React component: Profile update failed:', data);
        // Wait before showing error toast
        await new Promise(resolve => setTimeout(resolve, 250));
        toast.error('Failed to save profile. Please try again.');
      }
    } catch (error) {
      console.error('React component: Error updating profile:', error);
      // Wait before showing error toast
      await new Promise(resolve => setTimeout(resolve, 250));
      toast.error('Error saving profile. Please try again.');
    }
  };

  const handleCredentialsUpdateRequest = async (detail: { newEmail?: string; currentPassword?: string; newPassword?: string; }) => {
    try {
        const response = await fetch('/api/user/update-credentials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(detail)
        });

        const data = await response.json();

        if (response.ok) {
            // Determine what was updated for more specific toast message
            const updatedFields: string[] = [];
            if (detail.newEmail?.trim()) {
                updatedFields.push('email');
            }
            if (detail.newPassword?.trim()) {
                updatedFields.push('password');
            }
            
            let message = 'Credentials updated!';
            if (updatedFields.length === 1) {
                message = `${updatedFields[0].charAt(0).toUpperCase() + updatedFields[0].slice(1)} updated!`;
            } else if (updatedFields.length === 2) {
                message = 'Email and password updated!';
            }
            
            toast.success(message);
            
            // Update cache if email was changed (we need to fetch new email from API)
            // For now, we'll let the EmailPasswordPanel update the cache when it loads
            // But we can trigger a cache refresh by dispatching an event
            // Cache will be updated when EmailPasswordPanel loads next time
            
            // Close the panel after a short delay to show the toast
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('closeProfilePanel'));
            }, 1000);
        } else {
            console.error('React component: Credentials update failed:', data);
            toast.error(data.error || 'Failed to update credentials. Please try again.');
        }
    } catch (error) {
        console.error('React component: Error updating credentials:', error);
        toast.error('Error updating credentials. Please try again.');
    }
  };


  useEffect(() => {
    // Expose the logout handler to the window for the Astro button
    // @ts-ignore
    window.profilePage = { handleLogout };

    // Check unified cache first
    const cached = getCachedProfileData();
    if (cached && (cached.firstName || cached.lastName)) {
        const newDisplayName = `${cached.firstName} ${cached.lastName.charAt(0)}`.trim();
        const newInitials = `${cached.firstName.charAt(0) || ''}${cached.lastName.charAt(0) || ''}`.toUpperCase();
        setProfileData({
            displayName: newDisplayName,
            userColor: cached.userColor,
            firstName: cached.firstName,
            lastName: cached.lastName,
            initials: newInitials,
        });
        // ProfileCardStackHeader component will handle header updates
    } else {
        // Fallback: Check legacy sessionStorage for backward compatibility
        const storedProfileData = sessionStorage.getItem('userProfileData');
        if (storedProfileData) {
            try {
                const parsedData = JSON.parse(storedProfileData);
                setProfileData({
                    displayName: parsedData.displayName,
                    userColor: parsedData.color,
                    firstName: parsedData.firstName,
                    lastName: parsedData.lastName,
                    initials: parsedData.initials,
                });
                // ProfileCardStackHeader component will handle header updates
                
                // Migrate to unified cache
                updateCachedProfileData({
                    firstName: parsedData.firstName,
                    lastName: parsedData.lastName,
                    userColor: parsedData.color
                });
            } catch (error) {
                console.error('Error parsing stored profile data:', error);
                sessionStorage.removeItem('userProfileData');
            }
        }
    }

    const handleUpdateProfileRequest = (event: CustomEvent) => handleProfileUpdateRequest(event.detail);
    const handleUpdateCredentialsRequest = (event: CustomEvent) => handleCredentialsUpdateRequest(event.detail);
    const handleProfileUpdate = (event: CustomEvent) => {
        const detail = event.detail;
        if (detail) {
            const newDisplayName = `${detail.firstName} ${detail.lastName.charAt(0)}`.trim();
            const newColor = detail.selectedColor || detail.userColor;
            setProfileData({
                displayName: newDisplayName,
                userColor: newColor,
                firstName: detail.firstName,
                lastName: detail.lastName,
                initials: `${detail.firstName.charAt(0) || ''}${detail.lastName.charAt(0) || ''}`.toUpperCase(),
            });
            
            // ProfileCardStackHeader component will handle header updates
            
            // Update unified cache
            updateCachedProfileData({
                firstName: detail.firstName,
                lastName: detail.lastName,
                userColor: newColor
            });
        }
    };


    window.addEventListener('updateProfileRequest', handleUpdateProfileRequest as unknown as EventListener);
    window.addEventListener('updateCredentialsRequest', handleUpdateCredentialsRequest as unknown as EventListener);
    window.addEventListener('updateProfile', handleProfileUpdate as unknown as EventListener);

    const handleOpenPanelEvent = (event: CustomEvent) => {
      if (window.innerWidth >= 1160) {
        const panelName = event.detail.panelName;
        // Only update if panel is actually changing (prevents unnecessary remounts)
        if (activePanel !== panelName) {
          setActivePanel(panelName);
          // Update timestamp when panel opens to force remount (only if changing)
          if (panelName === 'mySpaces') {
            setPanelOpenTime(Date.now());
          }
        }
      }
    };

    const handleClosePanelEvent = () => {
        if (window.innerWidth >= 1160) {
            setActivePanel(null);
        }
    }

    window.addEventListener('openProfilePanel', handleOpenPanelEvent as EventListener);
    window.addEventListener('closeProfilePanel', handleClosePanelEvent);

    return () => {
      // @ts-ignore
      delete window.profilePage;
      window.removeEventListener('updateProfileRequest', handleUpdateProfileRequest as unknown as EventListener);
      window.removeEventListener('updateCredentialsRequest', handleUpdateCredentialsRequest as unknown as EventListener);
      window.removeEventListener('updateProfile', handleProfileUpdate as unknown as EventListener);
      window.removeEventListener('openProfilePanel', handleOpenPanelEvent as EventListener);
      window.removeEventListener('closeProfilePanel', handleClosePanelEvent);
    };
  }, []);


  const renderPanel = () => {
    switch (activePanel) {
      case 'editNameColor':
        return <EditNameColorPanel firstName={profileData.firstName} lastName={profileData.lastName} selectedColor={profileData.userColor as any} />;
      case 'emailPassword':
        return <EmailPasswordPanel />;
      case 'myChurch':
        return <MyChurchPanel initialChurchData={churchData} />;
      case 'mySpaces':
        return <MySpacesPanel key={`mySpaces-${panelOpenTime}`} initialSpaces={spaces} />;
      case 'myData':
        return <MyDataPanel />;
      case 'myAchievements':
        return <MyAchievementsPanel />;
      case 'getSupport':
        return <GetSupportPanel version={version} />;
      case 'manageBilling':
        return <ManageBillingPanel publishableKey={publishableKey} />;
      case 'referral':
        return <ReferralPanel />;
      case 'aboutHarvous':
        return <AboutHarvousPanel letterHtml={founderLetterHtml} />;
      case 'lockPin':
        return <LockPinPanel />;
      default:
        return (
            <div id="default-panel" className="flex flex-col items-left h-full justify-end">
                {/* No buttons for profile page */}
            </div>
        );
    }
  };

  return (
    <div className="h-full">
        {renderPanel()}
    </div>
  );
};

export default ProfilePage;
