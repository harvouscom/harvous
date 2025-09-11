/**
 * Determines if a "More" button should be shown based on content type
 * @param contentType The type of content being displayed
 * @returns boolean indicating if the More button should be shown
 */
export function shouldShowMoreButton(contentType: "thread" | "note" | "space" | "dashboard"): boolean {
  switch (contentType) {
    case "thread":
    case "note":
    case "space":
      return true; // These have menu options
    case "dashboard":
    default:
      return false; // Dashboard has no menu options
  }
}

/**
 * Gets the menu options for a given content type
 * @param contentType The type of content being displayed
 * @returns Array of menu options
 */
export function getMenuOptions(contentType: "thread" | "note" | "space" | "dashboard") {
  switch (contentType) {
    case "thread":
      return [
        { action: "editThread", label: "Edit Thread" },
        { action: "eraseThread", label: "Erase Thread" }
      ];
    case "note":
      return [
        { action: "editNote", label: "Edit Note" },
        { action: "eraseNote", label: "Erase Note" }
      ];
    case "space":
      return [
        { action: "editSpace", label: "Edit Space" },
        { action: "eraseSpace", label: "Erase Space" }
      ];
    case "dashboard":
    default:
      return []; // No options for dashboard
  }
}
