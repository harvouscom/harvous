import { createRouter, createRoute, createRootRoute, redirect, lazyRouteComponent, Outlet } from '@tanstack/react-router';
import {
  isClassicAppSurface,
  isDedicatedPrototypeHost,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
  prototypeSettingsAccountRouteTo,
} from '@/lib/prototype-path';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import DashboardPage from './pages/DashboardPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import SpacePage from './pages/SpacePage';
import ThreadPage from './pages/ThreadPage';
import NotePage from './pages/NotePage';
import SimplifiedPrototypeLayout from './layouts/SimplifiedPrototypeLayout';
import PrototypeHomePage from './pages/prototype/PrototypeHomePage';
import PrototypeNotePage from './pages/prototype/PrototypeNotePage';
import { noteParamSlug, normalizeNoteIdFromParam } from './pages/prototype/proto-route-slugs';

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

// App routes (authenticated, with nav shell)
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: DashboardPage,
});

// Keep /dashboard working as an alias — redirect to / (same as Astro where / is home)
const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/dashboard',
  beforeLoad: () => { throw redirect({ to: '/' }); },
});

const findRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/search',
  component: lazyRouteComponent(() => import('./pages/FindPage')),
});

const profileRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/profile',
  component: lazyRouteComponent(() => import('./pages/ProfilePage')),
});

const newSpaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/new-space',
  beforeLoad: () => {
    if (isClassicAppSurface()) {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: lazyRouteComponent(() => import('./pages/NewSpacePage')),
});

const upgradeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upgrade',
  component: lazyRouteComponent(() => import('./pages/UpgradePage')),
});

// Space / thread / note content routes (eager — core navigation path)
const spaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/space/$spaceId',
  component: SpacePage,
});

const threadRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/thread/$threadId',
  component: ThreadPage,
  validateSearch: (search: Record<string, unknown>) => ({
    space: typeof search.space === 'string' ? search.space : undefined,
  }),
});

const noteRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/note/$noteId',
  component: NotePage,
  validateSearch: (search: Record<string, unknown>) => ({
    space: typeof search.space === 'string' ? search.space : undefined,
    thread: typeof search.thread === 'string' ? search.thread : undefined,
    from: typeof search.from === 'string' ? search.from : undefined,
    collection: typeof search.collection === 'string' ? search.collection : undefined,
  }),
});

const adminVotdRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/votd',
  component: lazyRouteComponent(() => import('./pages/AdminVotdPage')),
});

const adminUsageRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/usage',
  component: lazyRouteComponent(() => import('./pages/AdminUsagePage')),
});

const joinSpaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/spaces/join/$token',
  component: lazyRouteComponent(() => import('./pages/public/PublicJoinSpacePage')),
});

const sharedNoteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/note/$shareToken',
  component: lazyRouteComponent(() => import('./pages/public/PublicSharedNotePage')),
});

const sharedThreadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/thread/$shareToken',
  component: lazyRouteComponent(() => import('./pages/public/PublicSharedThreadPage')),
});

const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitations/$token',
  component: lazyRouteComponent(() => import('./pages/public/PublicInvitationPage')),
});

/** Prototype branch — pathless layout on new.harvous.com (/), /prototype on app.harvous.com. */
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

  const prototypeLegacySpaceNoteRedirectRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'space/$spaceId/n/$noteId',
    beforeLoad: ({ params }) => {
      throw redirect({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(normalizeNoteIdFromParam(params.noteId)) },
        replace: true,
      });
    },
  });

  // Legacy `/n/<id>` links (old numeric/`/n/` scheme) → root `/<base62-slug>`.
  const prototypeLegacyFlatNoteRedirectRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'n/$noteId',
    beforeLoad: ({ params }) => {
      throw redirect({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(normalizeNoteIdFromParam(params.noteId)) },
        replace: true,
      });
    },
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

  const prototypeNoteFlatRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: '$noteId',
    component: PrototypeNotePage,
    validateSearch: (search: Record<string, unknown>) => ({
      studyThread: typeof search.studyThread === 'string' ? search.studyThread : undefined,
      reference: typeof search.reference === 'string' ? search.reference : undefined,
      scriptureRef: typeof search.scriptureRef === 'string' ? search.scriptureRef : undefined,
      scriptureTranslation:
        typeof search.scriptureTranslation === 'string' ? search.scriptureTranslation : undefined,
      highlight: typeof search.highlight === 'string' ? search.highlight : undefined,
      dockReq: typeof search.dockReq === 'string' ? search.dockReq : undefined,
      crossRefTarget: typeof search.crossRefTarget === 'string' ? search.crossRefTarget : undefined,
    }),
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

  const prototypeAdminUsageRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/usage',
    component: lazyRouteComponent(() => import('./pages/AdminUsagePage')),
  });

  const prototypeAdminVotdRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/votd',
    component: lazyRouteComponent(() => import('./pages/AdminVotdPage')),
  });

  return simplifiedPrototypeRoute.addChildren([
    prototypeLegacySpaceNoteRedirectRoute,
    prototypeLegacySpaceRedirectRoute,
    prototypeLegacyFlatNoteRedirectRoute,
    prototypeHomeRoute,
    prototypeSearchRedirectRoute,
    prototypeAdminUsageRoute,
    prototypeAdminVotdRoute,
    prototypeNoteFlatRoute,
    prototypeSettingsRoute.addChildren([
      prototypeSettingsIndexRoute,
      prototypeSettingsAccountRoute,
      prototypeSettingsTranslationRoute,
      prototypeSettingsAppearanceRoute,
      prototypeSettingsChurchRoute,
      prototypeSettingsLockPinRoute,
      prototypeSettingsSharingRoute,
      prototypeSettingsDataRoute,
      prototypeSettingsSupportRoute,
      prototypeSettingsKeyboardShortcutsRoute,
    ]),
  ]);
}

const dedicatedDashboardRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true });
  },
});

/** Redirect routes for classic URLs when the dedicated prototype host is active. */
function buildClassicRedirectRoutes() {
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
      throw redirect({ to: '/', replace: true });
    },
  });

  const classicSpaceRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: '/space/$spaceId',
    beforeLoad: () => {
      throw redirect({ to: '/', replace: true });
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
      throw redirect({ to: '/', replace: true });
    },
  });

  return [
    dedicatedDashboardRedirectRoute,
    classicNoteRedirect,
    classicThreadRedirect,
    classicSpaceRedirect,
    classicProfileRedirect,
    classicSearchRedirect,
  ];
}

// 404 catch-all — must be last
const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '*',
  component: lazyRouteComponent(() => import('./pages/NotFoundPage')),
});

const classicAppRoutes = appLayoutRoute.addChildren([
  indexRoute,
  dashboardRoute,
  findRoute,
  profileRoute,
  newSpaceRoute,
  spaceRoute,
  threadRoute,
  noteRoute,
  adminVotdRoute,
  adminUsageRoute,
]);

function buildRouteTree() {
  const onDedicatedHost = isDedicatedPrototypeHost();

  return rootRoute.addChildren([
    authLayoutRoute.addChildren([
      signInRoute.addChildren([signInSplatRoute]),
      signUpRoute.addChildren([signUpSplatRoute]),
    ]),
    ...(onDedicatedHost ? buildClassicRedirectRoutes() : [classicAppRoutes]),
    upgradeRoute,
    joinSpaceRoute,
    sharedNoteRoute,
    sharedThreadRoute,
    invitationRoute,
    buildPrototypeRouteBranch(),
    notFoundRoute,
  ]);
}

export const router = createRouter({ routeTree: buildRouteTree() });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
