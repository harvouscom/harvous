/**
 * Client-side Session Tracker
 * 
 * Tracks user activities and sends session data to server when session ends.
 * Session ends after 5 minutes of inactivity or on page unload.
 */

(function() {
  'use strict';

  const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const MIN_SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes minimum

  let sessionData = {
    startTime: null,
    activities: [],
    lastActivityTime: null
  };

  let inactivityTimer = null;
  let isSessionActive = false;

  /**
   * Start a new session
   */
  function startSession() {
    sessionData = {
      startTime: new Date(),
      activities: [],
      lastActivityTime: new Date()
    };
    isSessionActive = true;
    resetInactivityTimer();
  }

  /**
   * Record an activity
   */
  function recordActivity(actionType, relatedId) {
    if (!isSessionActive) {
      startSession();
    }

    sessionData.activities.push({
      actionType,
      timestamp: new Date(),
      relatedId: relatedId || null
    });
    sessionData.lastActivityTime = new Date();
    resetInactivityTimer();
  }

  /**
   * Reset the inactivity timer
   */
  function resetInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }

    inactivityTimer = setTimeout(() => {
      endSession();
    }, SESSION_TIMEOUT_MS);
  }

  /**
   * End the current session and send to server
   */
  async function endSession() {
    if (!isSessionActive || !sessionData.startTime) {
      return;
    }

    const sessionDuration = sessionData.lastActivityTime.getTime() - sessionData.startTime.getTime();
    
    // Only send if session meets minimum requirements
    if (sessionDuration >= MIN_SESSION_DURATION_MS && sessionData.activities.length >= 2) {
      try {
        await fetch('/api/user/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            activities: sessionData.activities,
            startTime: sessionData.startTime.toISOString(),
            lastActivityTime: sessionData.lastActivityTime.toISOString()
          })
        });
      } catch (error) {
        console.error('Error sending session data:', error);
      }
    }

    // Reset session
    isSessionActive = false;
    sessionData = {
      startTime: null,
      activities: [],
      lastActivityTime: null
    };

    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  }

  /**
   * Track page load as activity. Monthly attendance is triggered from the SPA
   * after Clerk is signed in (see SimplifiedPrototypeLayout) to avoid cold-start 401s.
   */
  function trackPageLoad() {
    recordActivity('space_opened', window.location.pathname);
  }

  /**
   * Track note open (can be called from note detail pages)
   */
  window.trackNoteOpen = function(noteId) {
    recordActivity('note_opened', noteId);
  };

  /**
   * Track thread open (can be called from thread pages)
   */
  window.trackThreadOpen = function(threadId) {
    recordActivity('thread_opened', threadId);
  };

  /**
   * Track space open (can be called from space pages)
   */
  window.trackSpaceOpen = function(spaceId) {
    recordActivity('space_opened', spaceId);
  };

  /**
   * Track note edit (can be called when note is edited)
   */
  window.trackNoteEdit = function(noteId) {
    recordActivity('note_edited', noteId);
  };

  /**
   * Track content creation (can be called when note/thread/space is created)
   */
  window.trackContentCreated = function(itemId) {
    recordActivity('content_created', itemId);
  };

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageLoad);
  } else {
    trackPageLoad();
  }

  // End session on page unload
  window.addEventListener('beforeunload', () => {
    endSession();
  });

  // Track visibility changes (user switches tabs)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // User switched away - end session after timeout
      resetInactivityTimer();
    } else {
      // User came back - record activity
      recordActivity('space_opened', window.location.pathname);
    }
  });

})();

