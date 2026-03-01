import { createRouter, createRoute, createRootRoute, redirect, lazyRouteComponent } from '@tanstack/react-router';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';

// Dashboard is eagerly loaded since it's the default landing page
import DashboardPage from './pages/DashboardPage';

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
  component: lazyRouteComponent(() => import('./pages/SignInPage')),
});

// Clerk's multi-step sign-in flow pushes sub-routes like /sign-in/factor-one,
// /sign-in/continue, etc. — TanStack Router must handle them with the same component.
const signInSplatRoute = createRoute({
  getParentRoute: () => signInRoute,
  path: '$',
  component: lazyRouteComponent(() => import('./pages/SignInPage')),
});

const signUpRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/sign-up',
  component: lazyRouteComponent(() => import('./pages/SignUpPage')),
});

// Clerk's multi-step sign-up flow pushes sub-routes like /sign-up/continue,
// /sign-up/verify-email-address, etc.
const signUpSplatRoute = createRoute({
  getParentRoute: () => signUpRoute,
  path: '$',
  component: lazyRouteComponent(() => import('./pages/SignUpPage')),
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

// Space / thread / note content routes
const spaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/space/$spaceId',
  component: lazyRouteComponent(() => import('./pages/SpacePage')),
});

const threadRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/thread/$threadId',
  component: lazyRouteComponent(() => import('./pages/ThreadPage')),
});

const noteRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/note/$noteId',
  component: lazyRouteComponent(() => import('./pages/NotePage')),
});

// Public / unauthenticated routes
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
  ]),
  upgradeRoute,
  joinSpaceRoute,
  sharedNoteRoute,
  sharedThreadRoute,
  invitationRoute,
  notFoundRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
