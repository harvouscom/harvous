import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';

// Pages
import DashboardPage from './pages/DashboardPage';
import FindPage from './pages/FindPage';
import ProfilePage from './pages/ProfilePage';
import SpacePage from './pages/SpacePage';
import ThreadPage from './pages/ThreadPage';
import NotePage from './pages/NotePage';
import NewSpacePage from './pages/NewSpacePage';
import UpgradePage from './pages/UpgradePage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import JoinSpacePage from './pages/JoinSpacePage';
import SharedNotePage from './pages/SharedNotePage';
import SharedThreadPage from './pages/SharedThreadPage';
import InvitationPage from './pages/InvitationPage';

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

const signUpRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/sign-up',
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
  beforeLoad: () => { throw redirect({ to: '/dashboard' }); },
});

const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/dashboard',
  component: DashboardPage,
});

const findRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/find',
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
  getParentRoute: () => appLayoutRoute,
  path: '/upgrade',
  component: UpgradePage,
});

// Space / thread / note content routes
const spaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/s/$spaceId',
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

// Route tree
const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([
    signInRoute,
    signUpRoute,
  ]),
  appLayoutRoute.addChildren([
    indexRoute,
    dashboardRoute,
    findRoute,
    profileRoute,
    newSpaceRoute,
    upgradeRoute,
    spaceRoute,
    threadRoute,
    noteRoute,
  ]),
  joinSpaceRoute,
  sharedNoteRoute,
  sharedThreadRoute,
  invitationRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
