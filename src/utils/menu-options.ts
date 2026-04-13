/**
 * Determines if a "More" button should be shown based on content type
 * @param contentType The type of content being displayed
 * @param contentId Optional content ID to check for special cases (e.g., unorganized thread)
 * @param contentOwnerId Optional; when set with currentUserId, hide More for thread when member viewing another's thread
 * @param currentUserId Optional; current user id for ownership check
 * @returns boolean indicating if the More button should be shown
 */
export function shouldShowMoreButton(contentType: "thread" | "note" | "space" | "dashboard" | "profile" | "search" | "new-space", contentId?: string, contentOwnerId?: string | null, currentUserId?: string | null): boolean {
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
 * Whether the action strip should show any menu items. Pass `menuOptionCount` from
 * `getMenuOptions(...).length` so callers avoid duplicating visibility rules.
 */
export function shouldShowActionStripMenu(
  contentType: "thread" | "note" | "space" | "dashboard" | "profile" | "search" | "new-space",
  contentId: string | undefined,
  contentOwnerId: string | null | undefined,
  currentUserId: string | null | undefined,
  menuOptionCount: number
): boolean {
  if (contentType !== "thread" && contentType !== "note" && contentType !== "space") {
    return false;
  }
  if (!shouldShowMoreButton(contentType, contentId, contentOwnerId, currentUserId)) {
    return false;
  }
  return menuOptionCount > 0;
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
export function getMenuOptions(
  contentType: "thread" | "note" | "space" | "dashboard" | "profile" | "search" | "new-space",
  contentId?: string,
  noteType?: string,
  contentEncrypted?: boolean,
  contentEncryptedServer?: boolean,
  simpleNoteId?: number | null,
  spaceRole?: 'owner' | 'member' | null,
  contentOwnerId?: string | null,
  currentUserId?: string | null,
  spaceIsShared?: boolean,
  linkedFromNoteId?: string | null,
  /** For notes: parent thread id (e.g. to detect onboarding Welcome thread). */
  noteThreadId?: string | null
) {
  // No menu options for unorganized thread (cannot be edited or erased)
  if (contentType === "thread" && contentId === "thread_unorganized") {
    return [];
  }

  const canEditContent = contentOwnerId == null || currentUserId == null || contentOwnerId === currentUserId;

  switch (contentType) {
    case "thread":
      const isOnboardingThread = contentId?.startsWith('thread_onboarding_');
      if (!canEditContent) return [];
      if (isOnboardingThread) {
        return [
          { action: "eraseThread", label: "Erase Thread" },
          { action: "eraseThreadAndNotes", label: "Erase Thread and Notes" },
        ];
      }
      return [
        { action: "editThread", label: "Edit Thread" },
        { action: "shareThread", label: "Share" },
        { action: "eraseThread", label: "Erase Thread" },
        { action: "eraseThreadAndNotes", label: "Erase Thread and Notes" },
      ];
    case "note": {
      // Welcome thread only contains pack notes; thread id is enough (addedBy may be missing from seeded cache).
      const isOnboardingPackNote = !!noteThreadId?.startsWith('thread_onboarding_');
      const options = [];

      // Notes tab: scripture (backlinks) or default note created from highlighted text in another note
      if (noteType === 'scripture' || (noteType === 'default' && linkedFromNoteId)) {
        options.push({ action: "openNoteDetailsNotes", label: "Notes" });
      }

      options.push(
        { action: "openNoteDetailsThreads", label: "Threads" },
        { action: "openNoteDetailsTags", label: "Tags" }
      );

      // Lock / Remove lock for default notes only (owner only when contentOwnerId is set); not for view-only onboarding
      if (noteType === 'default' && canEditContent && !isOnboardingPackNote) {
        if (!contentEncrypted && contentEncryptedServer) {
          // Unlocked in session but still encrypted on server: show both options
          options.push({ action: "lockNote", label: "Lock" });
          options.push({ action: "removeLock", label: "Remove lock" });
        } else {
          const isLocked = contentEncrypted || contentEncryptedServer;
          options.push({ action: isLocked ? "removeLock" : "lockNote", label: isLocked ? "Remove lock" : "Lock" });
        }
      }

      // Share only when note is not locked; onboarding pack notes are not shareable
      if (contentEncrypted !== true && !isOnboardingPackNote) {
        options.push({ action: "shareNote", label: "Share" });
      }
      if (canEditContent && !isOnboardingPackNote) {
        options.push({ action: "eraseNote", label: "Erase Note" });
      }

      return options;
    }
    case "space":
      if (spaceRole === 'member') {
        return [
          { action: "viewSpace", label: "About Space" },
          { action: "openEditSpacePanelPeople", label: "People" },
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
