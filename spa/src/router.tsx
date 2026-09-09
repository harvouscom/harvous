import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  lazyRouteComponent,
  Outlet,
  stringifySearchWith,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { markNotificationNavigationReady } from './lib/notification-navigation';
import {
  isDedicatedPrototypeHost,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
  prototypeSettingsAccountRouteTo,
} from '@/lib/prototype-path';
import { isStatusHost } from '@/lib/status-page-host';
import AuthLayout from './layouts/AuthLayout';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import PrototypeRouteErrorState from './pages/prototype/PrototypeRouteErrorState';
import ProtoRoutePending from './pages/prototype/ProtoRoutePending';
import { PROTO_ROUTE_PENDING_DELAY_MS, PROTO_ROUTE_PENDING_MIN_MS } from './layouts/proto-motion';
import PublicJoinSpacePage from './pages/public/PublicJoinSpacePage';
import PublicSharedNotePage from './pages/public/PublicSharedNotePage';
import PublicSharedThreadPage from './pages/public/PublicSharedThreadPage';
import PublicInvitationPage from './pages/public/PublicInvitationPage';
import { noteParamSlug } from './pages/prototype/proto-route-slugs';
import { parsePrototypeSearch } from './router-search';
import { buildPrototypeRouteBranch } from './router-prototype';

function RootRouteComponent() {
  useEffect(() => {
    markNotificationNavigationReady();
  }, []);
  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: RootRouteComponent,
  beforeLoad: ({ location }) => {
    if (!isDedicatedPrototypeHost() || !location.pathname.startsWith('/prototype')) return;
    const rest = location.pathname.replace(/^\/prototype\/?/, '');
    throw redirect({
      to: rest ? `/${rest}` : '/',
      replace: true,
    });
  },
});

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

const discoverListingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/discover/$slug',
  component: lazyRouteComponent(() => import('./pages/public/PublicDiscoverListingPage')),
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

const importDesignGalleryRoute = import.meta.env.DEV
  ? createRoute({
      getParentRoute: () => rootRoute,
      path: '/__dev/import-design',
      validateSearch: (search: Record<string, unknown>) => ({
        scene: typeof search.scene === 'string' ? search.scene : undefined,
      }),
      component: lazyRouteComponent(() => import('./pages/dev/ImportDesignGalleryPage')),
    })
  : null;

function buildClassicRedirectRoutes() {
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
    discoverListingRoute,
    invitationRoute,
    statusRoute,
    ...(designSystemGalleryRoute ? [designSystemGalleryRoute] : []),
    ...(sharedSpacesDesignGalleryRoute ? [sharedSpacesDesignGalleryRoute] : []),
    ...(churchDesignGalleryRoute ? [churchDesignGalleryRoute] : []),
    ...(importDesignGalleryRoute ? [importDesignGalleryRoute] : []),
    buildPrototypeRouteBranch(rootRoute),
    notFoundRoute,
  ]);
}

export const router = createRouter({
  routeTree: buildRouteTree(),
  defaultErrorComponent: PrototypeRouteErrorState,
  defaultPendingComponent: ProtoRoutePending,
  defaultPendingMs: PROTO_ROUTE_PENDING_DELAY_MS,
  defaultPendingMinMs: PROTO_ROUTE_PENDING_MIN_MS,
  parseSearch: parsePrototypeSearch,
  stringifySearch: stringifySearchWith(JSON.stringify),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
