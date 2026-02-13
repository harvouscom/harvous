/**
 * Determines if a "More" button should be shown based on content type
 * @param contentType The type of content being displayed
 * @param contentId Optional content ID to check for special cases (e.g., unorganized thread)
 * @returns boolean indicating if the More button should be shown
 */
export function shouldShowMoreButton(contentType: "thread" | "note" | "space" | "dashboard" | "profile", contentId?: string): boolean {
  // Hide more button for unorganized thread (cannot be edited or erased)
  if (contentType === "thread" && contentId === "thread_unorganized") {
    return false;
  }
  
  switch (contentType) {
    case "thread":
    case "note":
    case "space":
      return true; // These have menu options
    case "dashboard":
    case "profile":
    default:
      return false; // Dashboard and profile have no menu options
  }
}

/**
 * Gets the menu options for a given content type
 * @param contentType The type of content being displayed
 * @param contentId Optional content ID to check for special cases (e.g., unorganized thread)
 * @param noteType Optional note type to determine if scripture-specific options should be shown
 * @param contentEncrypted Optional; when true, note is locked so we show "Remove lock" only
 * @param contentEncryptedServer Optional; when true and contentEncrypted is false, note is unlocked in session so we show "Remove lock"
 * @param simpleNoteId Optional; when set for notes, adds a "copy note ID" option with label e.g. N042
 * @param spaceRole Optional; when 'member', space menu shows Space details + Leave space only (no Edit/Erase)
 * @param contentOwnerId Optional; when set, edit/erase/lock only shown when contentOwnerId === currentUserId
 * @param currentUserId Optional; current user id for ownership check
 * @returns Array of menu options
 */
export function getMenuOptions(contentType: "thread" | "note" | "space" | "dashboard" | "profile", contentId?: string, noteType?: string, contentEncrypted?: boolean, contentEncryptedServer?: boolean, simpleNoteId?: number | null, spaceRole?: 'owner' | 'member' | null, contentOwnerId?: string | null, currentUserId?: string | null) {
  // No menu options for unorganized thread (cannot be edited or erased)
  if (contentType === "thread" && contentId === "thread_unorganized") {
    return [];
  }

  const canEditContent = contentOwnerId == null || currentUserId == null || contentOwnerId === currentUserId;

  switch (contentType) {
    case "thread":
      // Onboarding thread: only "Erase Thread & Notes", no Edit Thread (only for owner)
      const isOnboardingThread = contentId?.startsWith('thread_onboarding_');
      if (isOnboardingThread) {
        if (!canEditContent) return [];
        return [{ action: "eraseThreadAndNotes", label: "Erase Thread & Notes" }];
      }
      if (!canEditContent) return [];
      return [
        { action: "editThread", label: "Edit Thread" },
        { action: "eraseThread", label: "Erase Thread" }
      ];
    case "note":
      const options = [];

      // Copy note ID (prepend when simpleNoteId is available)
      if (simpleNoteId != null) {
        options.push({ action: "copyNoteId", label: `N${String(simpleNoteId).padStart(3, '0')}` });
      }

      // Add "Notes" option for scripture notes only
      if (noteType === 'scripture') {
        options.push({ action: "openNoteDetailsNotes", label: "Notes" });
      }

      options.push(
        { action: "openNoteDetailsThreads", label: "Threads" },
        { action: "openNoteDetailsTags", label: "Tags" }
      );

      // Lock / Remove lock for default notes only (owner only when contentOwnerId is set)
      if (noteType === 'default' && canEditContent) {
        const isLocked = contentEncrypted || contentEncryptedServer;
        options.push({ action: isLocked ? "removeLock" : "lockNote", label: isLocked ? "Remove lock" : "Lock" });
      }

      // Share only when note is not locked
      if (contentEncrypted !== true) {
        options.push({ action: "shareNote", label: "Share" });
      }
      if (canEditContent) {
        options.push({ action: "eraseNote", label: "Erase Note" });
      }

      return options;
    case "space":
      if (spaceRole === 'member') {
        return [
          { action: "viewSpace", label: "Space details" },
          { action: "leaveSpace", label: "Leave space" }
        ];
      }
      return [
        { action: "editSpace", label: "Edit Space" },
        { action: "eraseSpace", label: "Erase Space" }
      ];
    case "dashboard":
    case "profile":
    default:
      return []; // No options for dashboard and profile
  }
}
