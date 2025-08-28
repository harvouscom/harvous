/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

declare global {
  interface Window {
    Alpine: import("alpinejs").Alpine;
    htmx: typeof htmx;
  }

  // Harvous Content Organization Types
  interface Note {
    id: string;
    title: string;
    content: string;
    imageUrl?: string;
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
    class?: string;
  }
}

interface ImportMetaEnv {
  /** https://docs.astro.build/en/guides/astro-db/#libsql */
  readonly ASTRO_DB_REMOTE_URL: string;
  /** https://docs.astro.build/en/guides/astro-db/#libsql */
  readonly ASTRO_DB_APP_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
