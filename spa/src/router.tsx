import { createRouter, createRoute, createRootRoute, redirect, lazyRouteComponent } from '@tanstack/react-router';
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
import PrototypeSpaceLayout from './pages/prototype/PrototypeSpaceLayout';
import PrototypeSpaceIndexPage from './pages/prototype/PrototypeSpaceIndexPage';
import PrototypeNotePage from './pages/prototype/PrototypeNotePage';
import PrototypeSearchPage from './pages/prototype/PrototypeSearchPage';

// Root route
const rootRoute = createRootRoute();

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

// Clerk uses hash routing (e.g. /sign-in#/factor-one); splat kept for backwards compat.
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

// Clerk uses hash routing (e.g. /sign-up#/verify-email-address); splat kept for backwards compat.
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

// Public / unauthenticated routes (lazy — less common entry points)
const joinSpaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/spaces/join/$token',
  component: lazyRouteComponent(() => import('./pages/JoinSpacePage')),
});

const sharedNoteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/note/$shareToken',
  component: lazyRouteComponent(() => import('./pages/SharedNotePage')),
});

const sharedThreadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/thread/$shareToken',
  component: lazyRouteComponent(() => import('./pages/SharedThreadPage')),
});

const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitations/$token',
  component: lazyRouteComponent(() => import('./pages/InvitationPage')),
});

/** Simplified prototype — parallel shell, no threads in UI (see docs/SIMPLIFIED_WEB_PROTOTYPE.md). */
const simplifiedPrototypeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prototype',
  component: SimplifiedPrototypeLayout,
});

const prototypeHomeRoute = createRoute({
  getParentRoute: () => simplifiedPrototypeRoute,
  path: '/',
  component: PrototypeHomePage,
});

const prototypeSearchRoute = createRoute({
  getParentRoute: () => simplifiedPrototypeRoute,
  path: 'search',
  component: PrototypeSearchPage,
  validateSearch: (search: Record<string, unknown>) => ({
    space: typeof search.space === 'string' ? search.space : undefined,
  }),
});

const prototypeSpaceLayoutRoute = createRoute({
  getParentRoute: () => simplifiedPrototypeRoute,
  path: 'space/$spaceId',
  component: PrototypeSpaceLayout,
});

const prototypeSpaceIndexRoute = createRoute({
  getParentRoute: () => prototypeSpaceLayoutRoute,
  path: '/',
  component: PrototypeSpaceIndexPage,
});

const prototypeSpaceNoteRoute = createRoute({
  getParentRoute: () => prototypeSpaceLayoutRoute,
  path: 'n/$noteId',
  component: PrototypeNotePage,
});

// 404 catch-all — must be last
const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '*',
  component: lazyRouteComponent(() => import('./pages/NotFoundPage')),
});

// Route tree
const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([
    signInRoute.addChildren([signInSplatRoute]),
    signUpRoute.addChildren([signUpSplatRoute]),
  ]),
  appLayoutRoute.addChildren([
    indexRoute,
    dashboardRoute,
    findRoute,
    profileRoute,
    newSpaceRoute,
    spaceRoute,
    threadRoute,
    noteRoute,
    adminVotdRoute,
  ]),
  upgradeRoute,
  joinSpaceRoute,
  sharedNoteRoute,
  sharedThreadRoute,
  invitationRoute,
  simplifiedPrototypeRoute.addChildren([
    prototypeHomeRoute,
    prototypeSearchRoute,
    prototypeSpaceLayoutRoute.addChildren([prototypeSpaceIndexRoute, prototypeSpaceNoteRoute]),
  ]),
  notFoundRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
