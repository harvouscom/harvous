import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import DashboardPage from './pages/DashboardPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import FindPage from './pages/FindPage';
import ProfilePage from './pages/ProfilePage';
import NewSpacePage from './pages/NewSpacePage';
import UpgradePage from './pages/UpgradePage';
import SpacePage from './pages/SpacePage';
import ThreadPage from './pages/ThreadPage';
import NotePage from './pages/NotePage';
import JoinSpacePage from './pages/JoinSpacePage';
import SharedNotePage from './pages/SharedNotePage';
import SharedThreadPage from './pages/SharedThreadPage';
import InvitationPage from './pages/InvitationPage';
import NotFoundPage from './pages/NotFoundPage';

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

// Clerk's multi-step sign-in flow pushes sub-routes like /sign-in/factor-one,
// /sign-in/continue, etc. — TanStack Router must handle them with the same component.
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

// Clerk's multi-step sign-up flow pushes sub-routes like /sign-up/continue,
// /sign-up/verify-email-address, etc.
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
  component: FindPage,
});

const profileRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/profile',
  component: ProfilePage,
});

const newSpaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/new-space',
  component: NewSpacePage,
});

const upgradeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upgrade',
  component: UpgradePage,
});

// Space / thread / note content routes
const spaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/space/$spaceId',
  component: SpacePage,
});

const threadRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/thread/$threadId',
  component: ThreadPage,
});

const noteRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/note/$noteId',
  component: NotePage,
});

// Public / unauthenticated routes
const joinSpaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/spaces/join/$token',
  component: JoinSpacePage,
});

const sharedNoteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/note/$shareToken',
  component: SharedNotePage,
});

const sharedThreadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/thread/$shareToken',
  component: SharedThreadPage,
});

const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitations/$token',
  component: InvitationPage,
});

// 404 catch-all — must be last
const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '*',
  component: NotFoundPage,
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
