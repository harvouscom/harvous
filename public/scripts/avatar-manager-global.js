// Avatar Manager Global Script - Production Ready
// This will be included directly in the Layout and work in both dev and production

(function() {
  console.log('Avatar Manager Global Script: Loading...');
  
  async function updateAllAvatars(color, initials) {
    const errors = [];
    let updatedCount = 0;
    
    try {
      const avatarSelector = '.avatar-button[data-avatar-color]';
      const avatars = document.querySelectorAll(avatarSelector);
      
      console.log(`Avatar Manager: Found ${avatars.length} avatar elements`);
      
      if (avatars.length === 0) {
        console.warn('Avatar Manager: No avatar elements found with selector:', avatarSelector);
        return { updatedCount: 0, errors: ['No avatar elements found'] };
      }
      
      const newColor = `var(--color-${color})`;
      
      avatars.forEach((avatar, index) => {
        try {
          const avatarElement = avatar;
          
          // Update background color
          avatarElement.style.backgroundColor = newColor;
          
          // Update initials text - correct selector for Avatar component structure
          const initialsElement = avatarElement.querySelector('p');
          if (initialsElement) {
            initialsElement.textContent = initials;
            console.log(`Avatar Manager: Updated initials for avatar ${index + 1}: ${initials}`);
          } else {
            console.warn(`Avatar Manager: No initials element found in avatar ${index + 1}`);
            errors.push(`No initials element found in avatar ${index + 1}`);
          }
          
          // Update data attributes
          avatarElement.setAttribute('data-avatar-color', color);
          avatarElement.setAttribute('data-avatar-initials', initials);
          
          updatedCount++;
          console.log(`Avatar Manager: Successfully updated avatar ${index + 1}`);
        } catch (error) {
          const errorMsg = `Failed to update avatar ${index + 1}: ${error}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      });
      
      console.log(`Avatar Manager: Updated ${updatedCount} avatars successfully`);
      
      // Dispatch custom event for other components to listen to
      window.dispatchEvent(new CustomEvent('avatarUpdated', {
        detail: { color, initials, updatedCount, errors }
      }));
      
      return { updatedCount, errors };
    } catch (error) {
      const errorMsg = `Avatar Manager: Critical error: ${error}`;
      console.error(errorMsg);
      return { updatedCount: 0, errors: [errorMsg] };
    }
  }

  function initializeAvatarManager() {
    console.log('Avatar Manager: Initialized');
    
    // Make updateAllAvatars available globally
    window.updateAllAvatars = updateAllAvatars;
    
    // Also make it available as a named export for direct imports
    window.avatarManager = {
      updateAllAvatars,
      initializeAvatarManager
    };
  }

  // Initialize immediately
  initializeAvatarManager();
  
  // Also initialize on DOM ready as a fallback
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('Avatar Manager Global Script: DOM ready, initializing...');
      initializeAvatarManager();
    });
  } else {
    // DOM already loaded
    console.log('Avatar Manager Global Script: DOM already loaded, initializing...');
    initializeAvatarManager();
  }

  // Also initialize on page transitions (for SPA-like behavior)
  document.addEventListener('astro:page-load', () => {
    console.log('Avatar Manager Global Script: Page load, re-initializing...');
    initializeAvatarManager();
  });
})();
