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
 * @returns Array of menu options
 */
export function getMenuOptions(contentType: "thread" | "note" | "space" | "dashboard" | "profile", contentId?: string, noteType?: string) {
  // No menu options for unorganized thread (cannot be edited or erased)
  if (contentType === "thread" && contentId === "thread_unorganized") {
    return [];
  }
  
  switch (contentType) {
    case "thread":
      // Check if this is an onboarding thread
      const isOnboardingThread = contentId?.startsWith('thread_onboarding_');
      return [
        { action: "editThread", label: "Edit Thread" },
        { action: isOnboardingThread ? "eraseThreadAndNotes" : "eraseThread", label: isOnboardingThread ? "Erase Thread & Notes" : "Erase Thread" }
      ];
    case "note":
      const options = [];
      
      // Add "Notes" option FIRST for scripture notes only
      if (noteType === 'scripture') {
        options.push({ action: "openNoteDetailsNotes", label: "Notes" });
      }
      
      // Then add existing options
      options.push(
        { action: "openNoteDetailsThreads", label: "Threads" },
        { action: "openNoteDetailsTags", label: "Tags" },
        { action: "eraseNote", label: "Erase Note" }
      );
      
      return options;
    case "space":
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
