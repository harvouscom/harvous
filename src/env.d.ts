/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

interface LocalUser {
  id: string;
  username: string;
  email: string;
}

interface LocalAuth {
  userId: string;
  isLoggedIn: boolean;
}

declare global {
  interface Window {
    Alpine: import("alpinejs").Alpine;
    htmx: typeof htmx;
  }

  namespace App {
    interface Locals {
      auth: () => LocalAuth;
      currentUser: () => Promise<LocalUser | null>;
    }
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
