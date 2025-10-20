/**
 * Avatar Manager Type Definitions
 * 
 * Type definitions for the avatar system. The actual implementation
 * is in src/scripts/avatar-manager.client.ts for proper production bundling.
 */

export interface AvatarData {
  color: string;
  initials: string;
}

export interface AvatarUpdateResult {
  updatedCount: number;
  errors: string[];
}

// Declare global for TypeScript
declare global {
  interface Window {
    updateAllAvatars?: (color: string, initials: string) => Promise<AvatarUpdateResult>;
  }
}
