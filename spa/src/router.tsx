import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  lazyRouteComponent,
  Outlet,
  stringifySearchWith,
} from '@tanstack/react-router';
import {
  isDedicatedPrototypeHost,
  isReservedPrototypeSegment,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
  prototypeSettingsAccountRouteTo,
} from '@/lib/prototype-path';
import { isStatusHost } from '@/lib/status-page-host';
import AuthLayout from './layouts/AuthLayout';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import SimplifiedPrototypeLayout from './layouts/SimplifiedPrototypeLayout';
import PrototypeHomePage from './pages/prototype/PrototypeHomePage';
import PrototypeRouteErrorState from './pages/prototype/PrototypeRouteErrorState';
import PrototypeSettingsLayout from './pages/prototype/settings/PrototypeSettingsLayout';
import PrototypeSettingsIndex from './pages/prototype/settings/PrototypeSettingsIndex';
import PrototypeAccountPage from './pages/prototype/settings/PrototypeAccountPage';
import PublicJoinSpacePage from './pages/public/PublicJoinSpacePage';
import PublicSharedNotePage from './pages/public/PublicSharedNotePage';
import PublicSharedThreadPage from './pages/public/PublicSharedThreadPage';
import PublicInvitationPage from './pages/public/PublicInvitationPage';
import {
  isPrototypeDraftNoteSlug,
  noteParamSlug,
  normalizeNoteIdFromParam,
} from './pages/prototype/proto-route-slugs';
import {
  normalizePrototypeApiSpaceId,
  toPrototypeSpaceSearchParam,
} from './utils/prototype-space-api-id';
import { requestFreezeMainForSettings } from './lib/prototype-settings-main-keepalive';
import { markPendingComposeSession } from './lib/pending-compose-session';

/**
 * Default TanStack search decode coerces bare digits to numbers (bad for space ids)
 * and stringify JSON-quotes numeric-looking strings (`space=%221785%22`).
 * Keep flat string params bare and un-coerced; still JSON-encode objects/arrays.
 */
function parsePrototypeSearch(searchStr: string): Record<string, unknown> {
  const raw = searchStr.startsWith('?') ? searchStr.slice(1) : searchStr;
  const params = new URLSearchParams(raw);
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, value] of params.entries()) {
    if (value === 'true') {
      result[key] = true;
      continue;
    }
    if (value === 'false') {
      result[key] = false;
      continue;
    }
    if (
      (value.startsWith('{') && value.endsWith('}')) ||
      (value.startsWith('[') && value.endsWith(']')) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      try {
        result[key] = JSON.parse(value);
        continue;
      } catch {
        /* keep string */
      }
    }
    result[key] = value;
  }
  return result;
}

export type PrototypeNoteSearch = {
  studyThread?: string;
  reference?: string;
  scriptureRef?: string;
  scriptureTranslation?: string;
  highlight?: string;
  /** Resource Library item id — opens a collapsed-only resource chip in the study dock. */
  libItem?: string;
  dockReq?: string;
  crossRefTarget?: string;
  /** Bare space id in the URL (`?space=1785…`); normalize with {@link normalizePrototypeApiSpaceId} for APIs. */
  space?: string;
};

export function legacySpaceNoteRedirectSearch(
  search: PrototypeNoteSearch,
  spaceId: string,
): PrototypeNoteSearch {
  return {
    ...search,
    space: toPrototypeSpaceSearchParam(normalizePrototypeApiSpaceId(spaceId)),
  };
}

// Root route — must render Outlet so child routes paint (pathless layouts included).
const rootRoute = createRootRoute({
  component: () => <Outlet />,
  beforeLoad: ({ location }) => {
    if (!isDedicatedPrototypeHost() || !location.pathname.startsWith('/prototype')) return;
    const rest = location.pathname.replace(/^\/prototype\/?/, '');
    throw redirect({
      to: rest ? `/${rest}` : '/',
      replace: true,
    });
  },
});

// Auth routes (no nav shell)
const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: AuthLayout,
});

const signInRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/sign-in',
  component: SignInPage,
});

// Clerk uses path routing (e.g. /sign-in/verify-email-address); splat kept for backwards compat.
const signInSplatRoute = createRoute({
  getParentRoute: () => signInRoute,
  path: '$',
  component: SignInPage,
});

const signUpRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/sign-up',
  component: SignUpPage,
});

// Clerk uses path routing (e.g. /sign-up/verify-email-address); splat kept for backwards compat.
const signUpSplatRoute = createRoute({
  getParentRoute: () => signUpRoute,
  path: '$',
  component: SignUpPage,
});

const upgradeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upgrade',
  component: lazyRouteComponent(() => import('./pages/UpgradePage')),
});

// Legacy `/addon` links (old slug) → `/upgrade`, preserving query params (e.g. return_url).
const legacyAddonRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/addon',
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/upgrade', search, replace: true });
  },
});

const joinSpaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/spaces/join/$token',
  component: PublicJoinSpacePage,
});

const sharedNoteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/note/$shareToken',
  component: PublicSharedNotePage,
});

const sharedThreadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/thread/$shareToken',
  component: PublicSharedThreadPage,
});

const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitations/$token',
  component: PublicInvitationPage,
});

const publicStatusPageComponent = lazyRouteComponent(() => import('./pages/public/PublicStatusPage'));

const statusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/status',
  component: publicStatusPageComponent,
});

/** status.harvous.com serves the status page at root (no app shell / no /prototype redirect). */
function buildStatusHostRoutes() {
  if (!isStatusHost()) return [];

  return [
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: publicStatusPageComponent,
    }),
  ];
}

const designSystemGalleryRoute = import.meta.env.DEV
  ? createRoute({
      getParentRoute: () => rootRoute,
      path: '/__dev/design-system',
      validateSearch: (search: Record<string, unknown>) => ({
        scene: typeof search.scene === 'string' ? search.scene : undefined,
      }),
      component: lazyRouteComponent(() => import('./pages/dev/design-system/DesignSystemGalleryPage')),
    })
  : null;

const sharedSpacesDesignGalleryRoute = import.meta.env.DEV
  ? createRoute({
      getParentRoute: () => rootRoute,
      path: '/__dev/shared-spaces-design',
      validateSearch: (search: Record<string, unknown>) => ({
        scene: typeof search.scene === 'string' ? search.scene : undefined,
      }),
      component: lazyRouteComponent(() => import('./pages/dev/SharedSpacesDesignGalleryPage')),
    })
  : null;

const churchDesignGalleryRoute = import.meta.env.DEV
  ? createRoute({
      getParentRoute: () => rootRoute,
      path: '/__dev/church-design',
      validateSearch: (search: Record<string, unknown>) => ({
        scene: typeof search.scene === 'string' ? search.scene : undefined,
      }),
      component: lazyRouteComponent(() => import('./pages/dev/ChurchDesignGalleryPage')),
    })
  : null;

/** Prototype branch — pathless layout on dedicated hosts (/), /prototype elsewhere. */
function buildPrototypeRouteBranch() {
  const onDedicatedHost = isDedicatedPrototypeHost();

  const simplifiedPrototypeRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...(onDedicatedHost ? { id: 'prototype-shell' } : { path: '/prototype' }),
    component: SimplifiedPrototypeLayout,
  });

  const prototypeHomeRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: '/',
    component: PrototypeHomePage,
  });

  const prototypeSearchRedirectRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'search',
    beforeLoad: () => {
      throw redirect({
        to: prototypeHomeRouteTo(),
        replace: true,
      });
    },
  });

  const validatePrototypeNoteSearch = (
    search: Record<string, unknown>,
  ): PrototypeNoteSearch => ({
    studyThread: typeof search.studyThread === 'string' ? search.studyThread : undefined,
    reference: typeof search.reference === 'string' ? search.reference : undefined,
    scriptureRef: typeof search.scriptureRef === 'string' ? search.scriptureRef : undefined,
    scriptureTranslation:
      typeof search.scriptureTranslation === 'string' ? search.scriptureTranslation : undefined,
    highlight: typeof search.highlight === 'string' ? search.highlight : undefined,
    libItem: typeof search.libItem === 'string' ? search.libItem : undefined,
    dockReq: typeof search.dockReq === 'string' ? search.dockReq : undefined,
    crossRefTarget: typeof search.crossRefTarget === 'string' ? search.crossRefTarget : undefined,
    // Accept legacy `?space=space_…` / JSON-quoted bookmarks; store bare ids in the address bar.
    space:
      typeof search.space === 'string' || typeof search.space === 'number'
        ? toPrototypeSpaceSearchParam(String(search.space))
        : undefined,
  });

  const prototypeLegacySpaceNoteRedirectRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'space/$spaceId/n/$noteId',
    validateSearch: validatePrototypeNoteSearch,
    beforeLoad: ({ params, search }) => {
      throw redirect({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(normalizeNoteIdFromParam(params.noteId)) },
        search: legacySpaceNoteRedirectSearch(search, params.spaceId),
        replace: true,
      });
    },
  });

  /** Legacy `/n/{id}` → forever redirect to flat `/{id}`; `/n/new` starts compose on `/`. */
  const prototypeNoteNestedRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'n/$noteId',
    validateSearch: validatePrototypeNoteSearch,
    beforeLoad: ({ params, search }) => {
      if (isPrototypeDraftNoteSlug(params.noteId) || params.noteId === 'compose') {
        markPendingComposeSession();
        throw redirect({
          to: prototypeHomeRouteTo(),
          replace: true,
        });
      }
      throw redirect({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(normalizeNoteIdFromParam(params.noteId)) },
        search,
        replace: true,
      });
    },
  });

  /**
   * Canonical note path. The shell layout hosts `PrototypeNotePage` so compose-on-`/`
   * → `/{id}` does not remount the editor; this route only owns params/search.
   */
  const prototypeNoteFlatRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: '$noteId',
    validateSearch: validatePrototypeNoteSearch,
    beforeLoad: ({ params }) => {
      const segment = params.noteId;
      if (!isReservedPrototypeSegment(segment)) return;
      if (isPrototypeDraftNoteSlug(segment) || segment === 'compose') {
        markPendingComposeSession();
      }
      throw redirect({
        to: prototypeHomeRouteTo(),
        replace: true,
      });
    },
    component: () => null,
  });

  const prototypeLegacySpaceRedirectRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'space/$spaceId',
    beforeLoad: () => {
      throw redirect({
        to: prototypeHomeRouteTo(),
        replace: true,
      });
    },
  });

  // Settings shell + Account are eager so the modal paints without a lazy-chunk gap
  // (opening settings replaces the shell Outlet; lag felt like a full reload).
  const prototypeSettingsRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'settings',
    component: PrototypeSettingsLayout,
    beforeLoad: () => {
      // Snapshot main content while the previous Outlet is still in the DOM.
      requestFreezeMainForSettings();
    },
  });

  const prototypeSettingsIndexRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: '/',
    component: PrototypeSettingsIndex,
  });

  const prototypeSettingsAccountRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'account',
    component: PrototypeAccountPage,
  });

  const prototypeSettingsTranslationRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'translation',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeTranslationPage')),
  });

  const prototypeSettingsAppearanceRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'appearance',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeAppearancePage')),
  });

  const prototypeSettingsChurchRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'church',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeChurchPage')),
  });

  // Note lock is temporarily disabled in the prototype (see settingsCategories.ts
  // for the full list of off-switches across web + native); the settings entry
  // point for it is intentionally not registered here so it isn't reachable by
  // direct URL. PrototypeLockPinPage and its supporting components are left in
  // place — this route can be re-added when note lock is turned back on.

  const prototypeSettingsSharingRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'sharing',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeSharingPage')),
  });

  const prototypeSettingsAddonsRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'addons',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeAddonsPage')),
  });

  const prototypeSettingsDataRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'data',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeDataPage')),
  });

  const prototypeSettingsSupportRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'support',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeSupportPage')),
  });

  const prototypeSettingsKeyboardShortcutsRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'keyboard-shortcuts',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeKeyboardShortcutsPage')),
  });

  const prototypeAdminHomeRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin',
    component: lazyRouteComponent(() => import('./pages/AdminHomePage')),
  });

  const prototypeAdminUsageRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/usage',
    component: lazyRouteComponent(() => import('./pages/AdminUsagePage')),
  });

  const prototypeAdminPulseRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/pulse',
    component: lazyRouteComponent(() => import('./pages/AdminPulsePage')),
  });

  const prototypeAdminReportsRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/reports',
    component: lazyRouteComponent(() => import('./pages/AdminReportsPage')),
  });

  const prototypeAdminPublishRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/publish',
    component: lazyRouteComponent(() => import('./pages/AdminPublishPage')),
  });

  const prototypeAdminMaintenanceRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/maintenance',
    component: lazyRouteComponent(() => import('./pages/AdminMaintenancePage')),
  });

  const prototypeAdminSupportRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/support',
    component: lazyRouteComponent(() => import('./pages/AdminSupportPage')),
  });

  const prototypeAdminVotdRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/votd',
    component: lazyRouteComponent(() => import('./pages/AdminVotdPage')),
  });

  const prototypeAdminChurchesRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/churches',
    component: lazyRouteComponent(() => import('./pages/AdminChurchesPage')),
  });

  const prototypeDevRouteErrorPreviewRoute = import.meta.env.DEV
    ? createRoute({
        getParentRoute: () => simplifiedPrototypeRoute,
        path: '__dev/route-error',
        component: lazyRouteComponent(() => import('./pages/prototype/PrototypeRouteErrorPreviewPage')),
      })
    : null;

  return simplifiedPrototypeRoute.addChildren([
    prototypeLegacySpaceNoteRedirectRoute,
    prototypeLegacySpaceRedirectRoute,
    prototypeNoteNestedRoute,
    prototypeHomeRoute,
    prototypeSearchRedirectRoute,
    prototypeAdminHomeRoute,
    prototypeAdminUsageRoute,
    prototypeAdminPulseRoute,
    prototypeAdminReportsRoute,
    prototypeAdminPublishRoute,
    prototypeAdminMaintenanceRoute,
    prototypeAdminSupportRoute,
    prototypeAdminVotdRoute,
    prototypeAdminChurchesRoute,
    ...(prototypeDevRouteErrorPreviewRoute ? [prototypeDevRouteErrorPreviewRoute] : []),
    prototypeNoteFlatRoute,
    prototypeSettingsRoute.addChildren([
      prototypeSettingsIndexRoute,
      prototypeSettingsAccountRoute,
      prototypeSettingsTranslationRoute,
      prototypeSettingsAppearanceRoute,
      prototypeSettingsChurchRoute,
      prototypeSettingsSharingRoute,
      prototypeSettingsAddonsRoute,
      prototypeSettingsDataRoute,
      prototypeSettingsSupportRoute,
      prototypeSettingsKeyboardShortcutsRoute,
    ]),
  ]);
}

/** Redirect legacy Classic URLs to the prototype shell on all hosts. */
function buildClassicRedirectRoutes() {
  // status.harvous.com owns `/` for the public status page — never send it to /prototype.
  const classicRootRedirect =
    !isDedicatedPrototypeHost() && !isStatusHost()
      ? createRoute({
          getParentRoute: () => rootRoute,
          path: '/',
          beforeLoad: () => {
            throw redirect({ to: '/prototype', replace: true });
          },
        })
      : null;

  const classicDashboardRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    beforeLoad: () => {
      throw redirect({ to: prototypeHomeRouteTo(), replace: true });
    },
  });

  const classicNoteRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: '/note/$noteId',
    beforeLoad: ({ params }) => {
      throw redirect({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(params.noteId) },
        replace: true,
      });
    },
  });

  const classicThreadRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: '/thread/$threadId',
    beforeLoad: () => {
      throw redirect({ to: prototypeHomeRouteTo(), replace: true });
    },
  });

  const classicSpaceRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: '/space/$spaceId',
    beforeLoad: () => {
      throw redirect({ to: prototypeHomeRouteTo(), replace: true });
    },
  });

  const classicProfileRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: '/profile',
    beforeLoad: () => {
      throw redirect({ to: prototypeSettingsAccountRouteTo(), replace: true });
    },
  });

  const classicSearchRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: '/search',
    beforeLoad: () => {
      throw redirect({ to: prototypeHomeRouteTo(), replace: true });
    },
  });

  const classicNewSpaceRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: '/new-space',
    beforeLoad: () => {
      throw redirect({ to: prototypeHomeRouteTo(), replace: true });
    },
  });

  return [
    ...(classicRootRedirect ? [classicRootRedirect] : []),
    classicDashboardRedirect,
    classicNoteRedirect,
    classicThreadRedirect,
    classicSpaceRedirect,
    classicProfileRedirect,
    classicSearchRedirect,
    classicNewSpaceRedirect,
  ];
}

// 404 catch-all — must be last
const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '*',
  component: lazyRouteComponent(() => import('./pages/NotFoundPage')),
});

function buildRouteTree() {
  if (isStatusHost()) {
    return rootRoute.addChildren([
      ...buildStatusHostRoutes(),
      statusRoute,
      notFoundRoute,
    ]);
  }

  return rootRoute.addChildren([
    authLayoutRoute.addChildren([
      signInRoute.addChildren([signInSplatRoute]),
      signUpRoute.addChildren([signUpSplatRoute]),
    ]),
    ...buildClassicRedirectRoutes(),
    upgradeRoute,
    legacyAddonRedirectRoute,
    joinSpaceRoute,
    sharedNoteRoute,
    sharedThreadRoute,
    invitationRoute,
    statusRoute,
    ...(designSystemGalleryRoute ? [designSystemGalleryRoute] : []),
    ...(sharedSpacesDesignGalleryRoute ? [sharedSpacesDesignGalleryRoute] : []),
    ...(churchDesignGalleryRoute ? [churchDesignGalleryRoute] : []),
    buildPrototypeRouteBranch(),
    notFoundRoute,
  ]);
}

export const router = createRouter({
  routeTree: buildRouteTree(),
  defaultErrorComponent: PrototypeRouteErrorState,
  parseSearch: parsePrototypeSearch,
  // No parser arg → do not JSON-quote flat string values (avoids %22 around space ids).
  stringifySearch: stringifySearchWith(JSON.stringify),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
