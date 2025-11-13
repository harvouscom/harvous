/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

declare global {
  interface Window {
    toast: {
      success: (message: string) => void;
      error: (message: string) => void;
      info: (message: string) => void;
      warning: (message: string) => void;
      show: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    };
    testToast: () => void;
    updateAllAvatars?: (color: string, initials: string) => Promise<{ updatedCount: number; errors: string[] }>;
    closeProfilePanel?: () => void;
    handleLogout?: (event: Event) => Promise<void>;
    Clerk?: {
      signOut: () => Promise<void>;
    };
  }

  // Harvous Content Organization Types
  interface Note {
    id: string;
    title: string;
    content: string;
    imageUrl?: string;
    noteType?: 'default' | 'scripture' | 'resource';
    createdAt: Date;
    updatedAt: Date;
    threadId?: string; // Optional: if note belongs to a thread
    spaceId: string; // Required: every note belongs to a space
  }

  interface Thread {
    id: string;
    title: string;
    description?: string;
    spaceId: string; // The space this thread belongs to
    notes: Note[]; // Notes within this thread
    createdAt: Date;
    updatedAt: Date;
    itemCount: number; // Count of notes in this thread
  }

  interface Space {
    id: string;
    title: string;
    description?: string;
    threads: Thread[]; // Threads within this space
    notes: Note[]; // Individual notes directly in this space (not in threads)
    createdAt: Date;
    updatedAt: Date;
    itemCount: number; // Total count of items (threads + notes) in this space
    isActive?: boolean; // Whether this space is currently selected/active
  }

  // Component Props Types
  interface SpaceButtonProps {
    text: string;
    count: number;
    state: "WithCount" | "WithoutCount";
    className?: string;
    backgroundGradient?: string;
    isActive?: boolean;
  }

  interface CardNoteProps {
    variant?: "default" | "withImage";
    title?: string;
    content?: string;
    imageUrl?: string;
    noteType?: 'default' | 'scripture' | 'resource';
    class?: string;
  }
}

interface ImportMetaEnv {
  /** https://docs.astro.build/en/guides/astro-db/#libsql */
  readonly ASTRO_DB_REMOTE_URL: string;
  /** https://docs.astro.build/en/guides/astro-db/#libsql */
  readonly ASTRO_DB_APP_TOKEN: string;
  
  // Astro Environment Variables
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  
  // Clerk Environment Variables
  readonly PUBLIC_CLERK_PUBLISHABLE_KEY: string;
  readonly CLERK_SECRET_KEY: string;
  readonly PUBLIC_CLERK_SIGN_IN_URL?: string;
  readonly PUBLIC_CLERK_SIGN_UP_URL?: string;
  
  // Webflow CMS API token for syncing inbox items
  readonly WEBFLOW_API_TOKEN?: string;
  // Webflow webhook secret for verifying webhook signatures
  readonly WEBFLOW_WEBHOOK_SECRET?: string;
  // Auto-archive secret token for securing the auto-archive endpoint
  readonly AUTO_ARCHIVE_SECRET_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}