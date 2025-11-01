// Global profile data sync - runs on every page load
(function() {
  function syncProfileData() {
    const storedProfileData = sessionStorage.getItem('userProfileData');
    
    if (storedProfileData) {
      try {
        const profileData = JSON.parse(storedProfileData);
        
        // Check if data is too old (1 hour)
        const oneHour = 60 * 60 * 1000;
        const isDataStale = Date.now() - profileData.timestamp > oneHour;
        
        if (isDataStale) {
          sessionStorage.removeItem('userProfileData');
          return;
        }
        
        // Update all avatars using the global function
        if (window.updateAllAvatars) {
          window.updateAllAvatars(profileData.color, profileData.initials);
        }
      } catch (error) {
        console.error('Profile Data Sync: Error parsing stored profile data:', error);
        sessionStorage.removeItem('userProfileData');
      }
    }
  }
  
  // Run immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncProfileData);
  } else {
    syncProfileData();
  }
  
  // Also run after View Transitions
  document.addEventListener('astro:page-load', syncProfileData);
})();

