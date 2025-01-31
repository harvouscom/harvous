/// <reference types="astro/client" />
/// <reference types="@clerk/astro/dist/types" />
/// <reference path="../.astro/db-types.d.ts" />
/// <reference path="../.astro/types.d.ts" />

import type { Auth, UserResource } from "@clerk/types";

declare global {
  interface Window {
    Alpine: import("alpinejs").Alpine;
    htmx: typeof htmx;
  }

  namespace App {
    interface Locals {
      auth: () => Auth;
      currentUser: () => Promise<UserResource | null>;
    }
  }
}