// Avatar Manager - Production-ready vanilla JS
(function() {
  async function updateAllAvatars(color, initials) {
    const errors = [];
    let updatedCount = 0;
    
    try {
      const avatarSelector = '.avatar-button[data-avatar-color]';
      const avatars = document.querySelectorAll(avatarSelector);
      
      console.log(`Avatar Manager: Found ${avatars.length} avatar elements`);
      
      if (avatars.length === 0) {
        return { updatedCount: 0, errors: ['No avatar elements found'] };
      }
      
      const newColor = `var(--color-${color})`;
      
      avatars.forEach((avatar, index) => {
        try {
          avatar.style.setProperty('background', newColor, 'important');
          avatar.style.setProperty('background-color', newColor, 'important');
          avatar.setAttribute('data-avatar-color', color);
          avatar.setAttribute('data-avatar-initials', initials);
          
          const initialsElement = avatar.querySelector('p');
          if (initialsElement) {
            initialsElement.textContent = initials;
          }
          
          updatedCount++;
        } catch (error) {
          errors.push(`Failed to update avatar ${index + 1}: ${error}`);
        }
      });
      
      console.log(`Avatar Manager: Updated ${updatedCount} avatars`);
      
      window.dispatchEvent(new CustomEvent('avatarUpdated', {
        detail: { color, initials, updatedCount }
      }));
      
      window.dispatchEvent(new CustomEvent('colorChanged', {
        detail: { color }
      }));
      
    } catch (error) {
      errors.push(`Avatar Manager error: ${error}`);
    }
    
    return { updatedCount, errors };
  }
  
  function initializeAvatarManager() {
    window.updateAllAvatars = updateAllAvatars;
    
    document.addEventListener('astro:page-load', () => {
      window.updateAllAvatars = updateAllAvatars;
    });
    
    console.log('Avatar Manager: Initialized');
  }
  
  // Auto-initialize
  if (typeof window !== 'undefined') {
    initializeAvatarManager();
  }
})();
