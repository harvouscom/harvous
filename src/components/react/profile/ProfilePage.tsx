import React, { useState, useEffect } from 'react';
import { toast } from '@/utils/toast';
import { clearCachedProfileData, updateCachedProfileData, getCachedProfileData } from '@/utils/profile-cache';

// Import panel components
import EditNameColorPanel from '@/components/react/EditNameColorPanel';
import EmailPasswordPanel from '@/components/react/EmailPasswordPanel';
import MyDataPanel from '@/components/react/MyDataPanel';
import MyChurchPanel from '@/components/react/MyChurchPanel';
import GetSupportPanel from '@/components/react/GetSupportPanel';

// Type definitions for props
export interface ProfilePageProps {
  displayName: string;
  userColor: string;
  joinDate: string;
  userXP: number;
  firstName: string;
  lastName: string;
  version?: string;
}

// Type definition for a panel name
type PanelName = 'editNameColor' | 'emailPassword' | 'myChurch' | 'myData' | 'getSupport' | null;

const ProfilePage: React.FC<ProfilePageProps> = ({
  displayName,
  userColor,
  joinDate,
  userXP,
  firstName,
  lastName,
  version = '0.10.0',
}) => {
  const [activePanel, setActivePanel] = useState<PanelName>(null);
  const [profileData, setProfileData] = useState({
    displayName,
    userColor,
    firstName,
    lastName,
    initials: `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase(),
  });

  const handleLogout = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    console.log('Logout button clicked');
    
    try {
      // @ts-ignore
      if (window.Clerk && window.Clerk.signOut) {
        // @ts-ignore
        console.log('Using Clerk signOut');
        // @ts-ignore
        await window.Clerk.signOut();
      } else {
        console.log('Clerk not available, using direct redirect');
      }
      
      sessionStorage.removeItem('userProfileData');
      console.log('Cleared profile data from sessionStorage');
      
      // Clear unified profile cache
      clearCachedProfileData();
      console.log('Cleared unified profile cache');
      
      console.log('Redirecting to sign-in page');
      window.location.href = '/sign-in';
    } catch (error) {
      console.error('Logout failed:', error);
      console.log('Fallback: redirecting to sign-in page');
      window.location.href = '/sign-in';
    }
  };

  // Function to update the CardStack header color and title
  const updateCardStackHeader = (color: string, displayName: string) => {
    const cardStack = document.getElementById('profile-cardstack');
    if (cardStack) {
      // Find the header div (first child div with style attribute)
      const headerElement = cardStack.querySelector('div[style*="background-color"]') as HTMLElement | null;
      if (headerElement) {
        // Update the background color
        headerElement.style.backgroundColor = `var(--color-${color})`;
        // Text color is always deep-grey for all thread colors
        headerElement.style.color = 'var(--color-deep-grey)';
      }
      
      // Update the title text (p tag inside the header)
      const titleElement = cardStack.querySelector('p');
      if (titleElement) {
        titleElement.textContent = displayName;
      }
    }
  };

  const handleProfileUpdateRequest = async (detail: { firstName: string; lastName: string; color: string; }) => {
    console.log('React component: updateProfileRequest received:', detail);
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
        console.log('✅ React component: Profile updated successfully');
        const newInitials = `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase();
        const newDisplayName = `${firstName} ${lastName.charAt(0)}`.trim();

        setProfileData({
            displayName: newDisplayName,
            userColor: color,
            firstName,
            lastName,
            initials: newInitials
        });

        // Update the CardStack header immediately
        updateCardStackHeader(color, newDisplayName);

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
        console.log('✅ ProfilePage: Cache updated after profile update');
        
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
        
        toast.success('Name and color updated successfully!');

      } else {
        console.error('❌ React component: Profile update failed:', data);
        // Wait before showing error toast
        await new Promise(resolve => setTimeout(resolve, 250));
        toast.error('Failed to save profile. Please try again.');
      }
    } catch (error) {
      console.error('❌ React component: Error updating profile:', error);
      // Wait before showing error toast
      await new Promise(resolve => setTimeout(resolve, 250));
      toast.error('Error saving profile. Please try again.');
    }
  };

  const handleCredentialsUpdateRequest = async (detail: { newEmail?: string; currentPassword?: string; newPassword?: string; }) => {
    console.log('React component: updateCredentialsRequest received:', detail);
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
            console.log('✅ React component: Credentials updated successfully');
            
            // Determine what was updated for more specific toast message
            const updatedFields: string[] = [];
            if (detail.newEmail?.trim()) {
                updatedFields.push('email');
            }
            if (detail.newPassword?.trim()) {
                updatedFields.push('password');
            }
            
            let message = 'Credentials updated successfully!';
            if (updatedFields.length === 1) {
                message = `${updatedFields[0].charAt(0).toUpperCase() + updatedFields[0].slice(1)} updated successfully!`;
            } else if (updatedFields.length === 2) {
                message = 'Email and password updated successfully!';
            }
            
            toast.success(message);
            
            // Update cache if email was changed (we need to fetch new email from API)
            // For now, we'll let the EmailPasswordPanel update the cache when it loads
            // But we can trigger a cache refresh by dispatching an event
            if (detail.newEmail?.trim()) {
                // Cache will be updated when EmailPasswordPanel loads next time
                // Or we could fetch the profile again here, but that's an extra API call
                console.log('📝 ProfilePage: Email updated, cache will refresh on next panel load');
            }
            
            // Close the panel after a short delay to show the toast
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('closeProfilePanel'));
            }, 1000);
        } else {
            console.error('❌ React component: Credentials update failed:', data);
            toast.error(data.error || 'Failed to update credentials. Please try again.');
        }
    } catch (error) {
        console.error('❌ React component: Error updating credentials:', error);
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
        console.log('🔄 Found cached profile data');
        const newDisplayName = `${cached.firstName} ${cached.lastName.charAt(0)}`.trim();
        const newInitials = `${cached.firstName.charAt(0) || ''}${cached.lastName.charAt(0) || ''}`.toUpperCase();
        setProfileData({
            displayName: newDisplayName,
            userColor: cached.userColor,
            firstName: cached.firstName,
            lastName: cached.lastName,
            initials: newInitials,
        });
        // Update the CardStack header immediately
        updateCardStackHeader(cached.userColor, newDisplayName);
    } else {
        // Fallback: Check legacy sessionStorage for backward compatibility
        const storedProfileData = sessionStorage.getItem('userProfileData');
        if (storedProfileData) {
            try {
                const parsedData = JSON.parse(storedProfileData);
                console.log('🔄 Found legacy profile data in sessionStorage, migrating to cache');
                setProfileData({
                    displayName: parsedData.displayName,
                    userColor: parsedData.color,
                    firstName: parsedData.firstName,
                    lastName: parsedData.lastName,
                    initials: parsedData.initials,
                });
                // Update the CardStack header immediately
                updateCardStackHeader(parsedData.color, parsedData.displayName);
                
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
            // Update the CardStack header immediately
            updateCardStackHeader(newColor, newDisplayName);
            
            // Update unified cache
            updateCachedProfileData({
                firstName: detail.firstName,
                lastName: detail.lastName,
                userColor: newColor
            });
            console.log('✅ ProfilePage: Cache updated after profile update event');
        }
    };


    window.addEventListener('updateProfileRequest', handleUpdateProfileRequest as EventListener);
    window.addEventListener('updateCredentialsRequest', handleUpdateCredentialsRequest as EventListener);
    window.addEventListener('updateProfile', handleProfileUpdate as EventListener);

    const handleOpenPanelEvent = (event: CustomEvent) => {
      if (window.innerWidth >= 1160) {
        setActivePanel(event.detail.panelName);
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
      window.removeEventListener('updateProfileRequest', handleUpdateProfileRequest as EventListener);
      window.removeEventListener('updateCredentialsRequest', handleUpdateCredentialsRequest as EventListener);
      window.removeEventListener('updateProfile', handleProfileUpdate as EventListener);
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
        return <MyChurchPanel />;
      case 'myData':
        return <MyDataPanel />;
      case 'getSupport':
        return <GetSupportPanel version={version} />;
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
