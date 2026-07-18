import { createRouter, createRoute, createRootRoute, redirect, lazyRouteComponent, Outlet } from '@tanstack/react-router';
import {
  isDedicatedPrototypeHost,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
  prototypeSettingsAccountRouteTo,
} from '@/lib/prototype-path';
import AuthLayout from './layouts/AuthLayout';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import SimplifiedPrototypeLayout from './layouts/SimplifiedPrototypeLayout';
import PrototypeHomePage from './pages/prototype/PrototypeHomePage';
import PrototypeNotePage from './pages/prototype/PrototypeNotePage';
import PrototypeRouteErrorState from './pages/prototype/PrototypeRouteErrorState';
import PublicJoinSpacePage from './pages/public/PublicJoinSpacePage';
import PublicSharedNotePage from './pages/public/PublicSharedNotePage';
import PublicSharedThreadPage from './pages/public/PublicSharedThreadPage';
import PublicInvitationPage from './pages/public/PublicInvitationPage';
import { noteParamSlug, normalizeNoteIdFromParam } from './pages/prototype/proto-route-slugs';
import { normalizePrototypeApiSpaceId } from './utils/prototype-space-api-id';

export type PrototypeNoteSearch = {
  studyThread?: string;
  reference?: string;
  scriptureRef?: string;
  scriptureTranslation?: string;
  highlight?: string;
  dockReq?: string;
  crossRefTarget?: string;
  space?: string;
};

export function legacySpaceNoteRedirectSearch(
  search: PrototypeNoteSearch,
  spaceId: string,
): PrototypeNoteSearch {
  return {
    ...search,
    space: normalizePrototypeApiSpaceId(spaceId),
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
  path: '/addon',
  component: lazyRouteComponent(() => import('./pages/UpgradePage')),
});

// Legacy `/upgrade` links (old slug) → `/addon`, preserving query params (e.g. Clerk return_url).
const legacyUpgradeRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upgrade',
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/addon', search, replace: true });
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
    dockReq: typeof search.dockReq === 'string' ? search.dockReq : undefined,
    crossRefTarget: typeof search.crossRefTarget === 'string' ? search.crossRefTarget : undefined,
    space: typeof search.space === 'string' ? search.space : undefined,
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

  const prototypeNoteNestedRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'n/$noteId',
    validateSearch: validatePrototypeNoteSearch,
    ...(onDedicatedHost
      ? { component: PrototypeNotePage }
      : {
          beforeLoad: ({ params, search }) => {
            throw redirect({
              to: prototypeNoteRouteTo(),
              params: { noteId: noteParamSlug(normalizeNoteIdFromParam(params.noteId)) },
              search,
              replace: true,
            });
          },
        }),
  });

  const prototypeNoteFlatRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: '$noteId',
    validateSearch: validatePrototypeNoteSearch,
    ...(onDedicatedHost
      ? {
          beforeLoad: ({ params, search }) => {
            throw redirect({
              to: prototypeNoteRouteTo(),
              params: { noteId: noteParamSlug(normalizeNoteIdFromParam(params.noteId)) },
              search,
              replace: true,
            });
          },
        }
      : { component: PrototypeNotePage }),
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

  const prototypeSettingsRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'settings',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeSettingsLayout')),
  });

  const prototypeSettingsIndexRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: '/',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeSettingsIndex')),
  });

  const prototypeSettingsAccountRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'account',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeAccountPage')),
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

  const prototypeSettingsLockPinRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'lock-pin',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeLockPinPage')),
  });

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
      prototypeSettingsLockPinRoute,
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
  const classicRootRedirect = !isDedicatedPrototypeHost()
    ? createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        beforeLoad: () => {
          throw redirect({ to: '/prototype/', replace: true });
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
  return rootRoute.addChildren([
    authLayoutRoute.addChildren([
      signInRoute.addChildren([signInSplatRoute]),
      signUpRoute.addChildren([signUpSplatRoute]),
    ]),
    ...buildClassicRedirectRoutes(),
    upgradeRoute,
    legacyUpgradeRedirectRoute,
    joinSpaceRoute,
    sharedNoteRoute,
    sharedThreadRoute,
    invitationRoute,
    ...(designSystemGalleryRoute ? [designSystemGalleryRoute] : []),
    ...(sharedSpacesDesignGalleryRoute ? [sharedSpacesDesignGalleryRoute] : []),
    buildPrototypeRouteBranch(),
    notFoundRoute,
  ]);
}

export const router = createRouter({
  routeTree: buildRouteTree(),
  defaultErrorComponent: PrototypeRouteErrorState,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
