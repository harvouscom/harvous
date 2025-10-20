/**
 * Centralized Avatar Management Utility
 * 
 * Provides efficient, type-safe avatar updates across the application.
 * Replaces the bloated updateAllAvatars logic in profile.astro with a clean,
 * optimized solution that works with Astro View Transitions.
 */

export interface AvatarData {
  color: string;
  initials: string;
}

export interface AvatarUpdateResult {
  updatedCount: number;
  errors: string[];
}

/**
 * Update all avatar elements on the page with new color and initials
 * 
 * Uses a single, optimized selector strategy and efficient DOM updates.
 * Integrates with Astro View Transitions lifecycle.
 * 
 * @param color - The color name (e.g., 'blessed-blue', 'peaceful-pink')
 * @param initials - The user's initials (e.g., 'TJ', 'AB')
 * @returns Promise<AvatarUpdateResult> - Count of updated avatars and any errors
 */
export async function updateAllAvatars(color: string, initials: string): Promise<AvatarUpdateResult> {
  const errors: string[] = [];
  let updatedCount = 0;

  try {
    // Single, consistent selector strategy
    const avatarSelector = '.avatar-button[data-avatar-color]';
    const avatars = document.querySelectorAll(avatarSelector);
    
    console.log(`Avatar Manager: Found ${avatars.length} avatar elements to update`);
    
    if (avatars.length === 0) {
      console.warn('Avatar Manager: No avatar elements found with selector:', avatarSelector);
      return { updatedCount: 0, errors: ['No avatar elements found'] };
    }

    const newColor = `var(--color-${color})`;
    
    avatars.forEach((avatar, index) => {
      try {
        const avatarElement = avatar as HTMLElement;
        
        // Update color with single, efficient approach
        avatarElement.style.setProperty('background', newColor, 'important');
        avatarElement.style.setProperty('background-color', newColor, 'important');
        
        // Update data attributes
        avatarElement.setAttribute('data-avatar-color', color);
        avatarElement.setAttribute('data-avatar-initials', initials);
        
        // Update initials text
        const initialsElement = avatarElement.querySelector('p');
        if (initialsElement) {
          initialsElement.textContent = initials;
        } else {
          console.warn(`Avatar Manager: No initials element found in avatar ${index + 1}`);
        }
        
        updatedCount++;
        
      } catch (error) {
        const errorMsg = `Failed to update avatar ${index + 1}: ${error}`;
        console.error('Avatar Manager:', errorMsg);
        errors.push(errorMsg);
      }
    });

    console.log(`Avatar Manager: Successfully updated ${updatedCount} avatars`);
    
    // Dispatch events for reactive components
    window.dispatchEvent(new CustomEvent('avatarUpdated', {
      detail: { color, initials, updatedCount }
    }));
    
    window.dispatchEvent(new CustomEvent('colorChanged', {
      detail: { color }
    }));

  } catch (error) {
    const errorMsg = `Avatar Manager error: ${error}`;
    console.error(errorMsg);
    errors.push(errorMsg);
  }

  return { updatedCount, errors };
}

/**
 * Initialize avatar manager for Astro View Transitions
 * 
 * Sets up global window function and handles View Transitions lifecycle.
 * Call this once during app initialization.
 */
export function initializeAvatarManager(): void {
  // Make updateAllAvatars available globally for backward compatibility
  (window as any).updateAllAvatars = updateAllAvatars;
  
  // Re-initialize after View Transitions
  document.addEventListener('astro:page-load', () => {
    console.log('Avatar Manager: Re-initializing after View Transitions');
    (window as any).updateAllAvatars = updateAllAvatars;
  });
  
  console.log('Avatar Manager: Initialized successfully');
}

/**
 * Get current avatar data from the first avatar element on the page
 * 
 * @returns AvatarData | null - Current avatar data or null if no avatars found
 */
export function getCurrentAvatarData(): AvatarData | null {
  const avatar = document.querySelector('.avatar-button[data-avatar-color]') as HTMLElement;
  
  if (!avatar) {
    return null;
  }
  
  const color = avatar.getAttribute('data-avatar-color') || 'paper';
  const initials = avatar.getAttribute('data-avatar-initials') || 'U';
  
  return { color, initials };
}

/**
 * Validate avatar data
 * 
 * @param data - Avatar data to validate
 * @returns boolean - True if data is valid
 */
export function validateAvatarData(data: AvatarData): boolean {
  if (!data.color || !data.initials) {
    return false;
  }
  
  if (typeof data.color !== 'string' || typeof data.initials !== 'string') {
    return false;
  }
  
  if (data.initials.length < 1 || data.initials.length > 3) {
    return false;
  }
  
  return true;
}
