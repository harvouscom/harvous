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
import ProtoRoutePending from './pages/prototype/ProtoRoutePending';
import { PROTO_ROUTE_PENDING_DELAY_MS, PROTO_ROUTE_PENDING_MIN_MS } from './layouts/proto-motion';
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
import { sanitizeReadSearch } from './utils/reader-nav';
