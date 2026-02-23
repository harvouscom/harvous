/**
 * Determines if a "More" button should be shown based on content type
 * @param contentType The type of content being displayed
 * @param contentId Optional content ID to check for special cases (e.g., unorganized thread)
 * @param contentOwnerId Optional; when set with currentUserId, hide More for thread when member viewing another's thread
 * @param currentUserId Optional; current user id for ownership check
 * @returns boolean indicating if the More button should be shown
 */
export function shouldShowMoreButton(contentType: "thread" | "note" | "space" | "dashboard" | "profile", contentId?: string, contentOwnerId?: string | null, currentUserId?: string | null): boolean {
  // Hide more button for unorganized thread (cannot be edited or erased)
  if (contentType === "thread" && contentId === "thread_unorganized") {
    return false;
  }

  // Hide More for thread when member viewing another's thread (no menu options)
  if (contentType === "thread" && contentOwnerId != null && currentUserId != null && contentOwnerId !== currentUserId) {
    return false;
  }

  // Hide More for note when member viewing another's note (same rule as threads)
  if (contentType === "note" && contentOwnerId != null && currentUserId != null && contentOwnerId !== currentUserId) {
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
 * @param spaceRole Optional; when 'member', space menu shows About Space + Leave Space only (no Edit/Erase)
 * @param contentOwnerId Optional; when set, edit/erase/lock only shown when contentOwnerId === currentUserId
 * @param currentUserId Optional; current user id for ownership check
 * @returns Array of menu options
 */
export function getMenuOptions(contentType: "thread" | "note" | "space" | "dashboard" | "profile", contentId?: string, noteType?: string, contentEncrypted?: boolean, contentEncryptedServer?: boolean, simpleNoteId?: number | null, spaceRole?: 'owner' | 'member' | null, contentOwnerId?: string | null, currentUserId?: string | null, spaceIsShared?: boolean) {
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
        if (!contentEncrypted && contentEncryptedServer) {
          // Unlocked in session but still encrypted on server: show both options
          options.push({ action: "lockNote", label: "Lock" });
          options.push({ action: "removeLock", label: "Remove lock" });
        } else {
          const isLocked = contentEncrypted || contentEncryptedServer;
          options.push({ action: isLocked ? "removeLock" : "lockNote", label: isLocked ? "Remove lock" : "Lock" });
        }
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
          { action: "viewSpace", label: "About Space" },
          { action: "leaveSpace", label: "Leave Space" }
        ];
      }
      const spaceOptions = [
        { action: "editSpace", label: "Edit Space" },
      ];
      if (spaceIsShared) {
        spaceOptions.push({ action: "openEditSpacePanelPeople", label: "People" });
      }
      spaceOptions.push({ action: "eraseSpace", label: "Erase Space" });
      return spaceOptions;
    case "dashboard":
    case "profile":
    default:
      return []; // No options for dashboard and profile
  }
}
