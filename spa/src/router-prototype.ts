import {
  createRoute,
  redirect,
  lazyRouteComponent,
  type AnyRoute,
} from '@tanstack/react-router';
import {
  isDedicatedPrototypeHost,
  isReservedPrototypeSegment,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
} from '@/lib/prototype-path';
import SimplifiedPrototypeLayout from './layouts/SimplifiedPrototypeLayout';
import PrototypeHomePage from './pages/prototype/PrototypeHomePage';
import PrototypeSettingsLayout from './pages/prototype/settings/PrototypeSettingsLayout';
import PrototypeSettingsIndex from './pages/prototype/settings/PrototypeSettingsIndex';
import PrototypeAccountPage from './pages/prototype/settings/PrototypeAccountPage';
import {
  isPrototypeDraftNoteSlug,
  noteParamSlug,
  normalizeNoteIdFromParam,
} from './pages/prototype/proto-route-slugs';
import { toPrototypeSpaceSearchParam } from './utils/prototype-space-api-id';
import { requestFreezeMainForSettings } from './lib/prototype-settings-main-keepalive';
import { markPendingComposeSession } from './lib/pending-compose-session';
import { sanitizeReadSearch } from './utils/reader-nav';
import {
  legacySpaceNoteRedirectSearch,
  type PrototypeNoteSearch,
} from './router-search';

export function buildPrototypeRouteBranch(rootRoute: AnyRoute) {
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
    annotate: typeof search.annotate === 'string' ? search.annotate : undefined,
    libItem: typeof search.libItem === 'string' ? search.libItem : undefined,
    dockReq: typeof search.dockReq === 'string' ? search.dockReq : undefined,
    crossRefTarget: typeof search.crossRefTarget === 'string' ? search.crossRefTarget : undefined,
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

  const prototypeReadRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'read/$book/$chapter',
    validateSearch: (
      search: Record<string, unknown>,
    ): {
      v?: string;
      vEnd?: string;
      t?: string;
      c?: string;
      ref?: string;
      req?: string;
    } =>
      sanitizeReadSearch({
        v: typeof search.v === 'string' ? search.v : undefined,
        vEnd: typeof search.vEnd === 'string' ? search.vEnd : undefined,
        t: typeof search.t === 'string' ? search.t : undefined,
        c: typeof search.c === 'string' ? search.c : undefined,
        ref: typeof search.ref === 'string' ? search.ref : undefined,
        req: typeof search.req === 'string' ? search.req : undefined,
      }),
    component: lazyRouteComponent(() => import('./pages/prototype/PrototypeReadPage')),
  });

  const prototypeReadTodayRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'read/today',
    component: lazyRouteComponent(() => import('./pages/prototype/PrototypeReadTodayPage')),
  });

  const prototypeReviewRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'review',
    beforeLoad: () => {
      throw redirect({ to: prototypeHomeRouteTo(), replace: true });
    },
  });

  const prototypeReviewSessionRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'review/session',
    beforeLoad: () => {
      throw redirect({ to: prototypeHomeRouteTo(), replace: true });
    },
  });

  const prototypeChallengesRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'challenges',
    component: lazyRouteComponent(() => import('./pages/prototype/PrototypeChallengesPage')),
  });

  const prototypeChallengeRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'challenges/$challengeId',
    component: lazyRouteComponent(() => import('./pages/prototype/PrototypeChallengePage')),
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
    component: PrototypeSettingsLayout,
    beforeLoad: () => {
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

  const prototypeSettingsRemindersRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'reminders',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeRemindersPage')),
  });

  const prototypeSettingsReviewExercisesRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'review-exercises',
    component: lazyRouteComponent(
      () => import('./pages/prototype/settings/PrototypeReviewExercisesPage'),
    ),
  });

  const prototypeSettingsChurchRoute = createRoute({
    getParentRoute: () => prototypeSettingsRoute,
    path: 'church',
    component: lazyRouteComponent(() => import('./pages/prototype/settings/PrototypeChurchPage')),
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

  const prototypeAdminDiscoverRoute = createRoute({
    getParentRoute: () => simplifiedPrototypeRoute,
    path: 'admin/discover',
    component: lazyRouteComponent(() => import('./pages/AdminDiscoverPage')),
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
    prototypeAdminDiscoverRoute,
    prototypeAdminVotdRoute,
    prototypeAdminChurchesRoute,
    ...(prototypeDevRouteErrorPreviewRoute ? [prototypeDevRouteErrorPreviewRoute] : []),
    prototypeReadTodayRoute,
    prototypeReadRoute,
    prototypeReviewSessionRoute,
    prototypeReviewRoute,
    prototypeChallengeRoute,
    prototypeChallengesRoute,
    prototypeNoteFlatRoute,
    prototypeSettingsRoute.addChildren([
      prototypeSettingsIndexRoute,
      prototypeSettingsAccountRoute,
      prototypeSettingsTranslationRoute,
      prototypeSettingsAppearanceRoute,
      prototypeSettingsRemindersRoute,
      prototypeSettingsReviewExercisesRoute,
      prototypeSettingsChurchRoute,
      prototypeSettingsSharingRoute,
      prototypeSettingsAddonsRoute,
      prototypeSettingsDataRoute,
      prototypeSettingsSupportRoute,
      prototypeSettingsKeyboardShortcutsRoute,
    ]),
  ]);
}
