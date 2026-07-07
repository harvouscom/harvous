import { describe, expect, it } from 'vitest';
import {
  resolveOptimisticSharedSpaceSelection,
  resolveSharedSpaceTitle,
  resolveSpaceSwitcherToolbarState,
} from '../useActiveSpace';
import { resolvePrototypeSidebarVariant } from '../../layouts/resolve-prototype-sidebar-variant';

describe('resolveOptimisticSharedSpaceSelection', () => {
  it('returns shared selection when persisted id differs from personal home', () => {
    expect(resolveOptimisticSharedSpaceSelection('space_shared_1', 'space_home')).toEqual({
      activeSpaceId: 'space_shared_1',
      isSharedSpace: true,
    });
  });

  it('normalizes ids without space_ prefix', () => {
    expect(resolveOptimisticSharedSpaceSelection('shared_1', 'space_home')).toEqual({
      activeSpaceId: 'space_shared_1',
      isSharedSpace: true,
    });
  });

  it('returns null when persisted id matches personal home', () => {
    expect(resolveOptimisticSharedSpaceSelection('space_home', 'space_home')).toBeNull();
  });

  it('returns null when persisted id or home id is missing', () => {
    expect(resolveOptimisticSharedSpaceSelection(null, 'space_home')).toBeNull();
    expect(resolveOptimisticSharedSpaceSelection('space_shared_1', null)).toBeNull();
  });
});

describe('resolveSharedSpaceTitle', () => {
  it('prefers nav title for owned and joined spaces', () => {
    expect(
      resolveSharedSpaceTitle('space_team', {
        nav: {
          threads: [],
          spaces: [{ id: 'space_team', title: 'Team Study', color: null, backgroundGradient: '', ownerId: 'u1', memberCount: 2, type: 'shared' }],
          memberOfSpaces: [],
          inboxCount: 0,
        },
      }),
    ).toBe('Team Study');

    expect(
      resolveSharedSpaceTitle('space_guest', {
        nav: {
          threads: [],
          spaces: [],
          memberOfSpaces: [{ id: 'space_guest', title: 'Guest Room', color: null, backgroundGradient: '', ownerId: 'u2', memberCount: 4, role: 'member' }],
          inboxCount: 0,
        },
      }),
    ).toBe('Guest Room');
  });

  it('falls back to prefetch/bootstrap titles when nav has not matched yet', () => {
    expect(
      resolveSharedSpaceTitle('space_team', {
        spaceDetailTitle: 'From API',
      }),
    ).toBe('From API');

    expect(
      resolveSharedSpaceTitle('space_team', {
        bootstrapTitle: 'Cached title',
      }),
    ).toBe('Cached title');
  });
});

describe('resolveSpaceSwitcherToolbarState', () => {
  it('shows My Home toolbar chrome for optimistic-only shared selection', () => {
    expect(
      resolveSpaceSwitcherToolbarState({
        space: null,
        spaceTitle: null,
        hasHome: true,
      }),
    ).toEqual({
      showSharedSpaceToolbar: false,
      label: null,
      triggerTitle: 'My Home',
    });
  });

  it('shows shared toolbar once nav confirms the space', () => {
    expect(
      resolveSpaceSwitcherToolbarState({
        space: {
          id: 'space_team',
          title: 'Team Study',
          color: null,
          backgroundGradient: '',
          ownerId: 'u1',
          memberCount: 2,
          type: 'shared',
        },
        spaceTitle: 'Team Study',
        hasHome: true,
      }),
    ).toEqual({
      showSharedSpaceToolbar: true,
      label: 'Team Study',
      triggerTitle: 'Team Study',
    });
  });

  it('never uses a generic Shared space fallback label', () => {
    expect(
      resolveSpaceSwitcherToolbarState({
        space: {
          id: 'space_team',
          title: 'Team Study',
          color: null,
          backgroundGradient: '',
          ownerId: 'u1',
          memberCount: 2,
          type: 'shared',
        },
        spaceTitle: null,
        hasHome: true,
      }).label,
    ).toBe('Team Study');
  });
});

describe('resolvePrototypeSidebarVariant', () => {
  it('uses shared-space view on space layer regardless of list mode', () => {
    expect(
      resolvePrototypeSidebarVariant({
        isAdminRoute: false,
        isSharedSpace: true,
        sidebarLayer: 'space',
        activeSpaceId: 'space_shared_1',
      }),
    ).toBe('shared-space');
  });

  it('uses scoped list sidebar on list layer for shared spaces', () => {
    expect(
      resolvePrototypeSidebarVariant({
        isAdminRoute: false,
        isSharedSpace: true,
        sidebarLayer: 'list',
        activeSpaceId: 'space_shared_1',
      }),
    ).toBe('shared-list');
  });

  it('uses personal sidebar for My Home', () => {
    expect(
      resolvePrototypeSidebarVariant({
        isAdminRoute: false,
        isSharedSpace: false,
        sidebarLayer: 'space',
        activeSpaceId: 'space_home',
      }),
    ).toBe('personal');
  });

  it('prefers admin sidebar on admin routes', () => {
    expect(
      resolvePrototypeSidebarVariant({
        isAdminRoute: true,
        isSharedSpace: true,
        sidebarLayer: 'space',
        activeSpaceId: 'space_shared_1',
      }),
    ).toBe('admin');
  });
});
