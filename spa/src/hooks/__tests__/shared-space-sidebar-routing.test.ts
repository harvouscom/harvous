import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveOptimisticSharedSpaceSelection,
  resolveSharedSpaceTitle,
  resolveSpaceSwitcherToolbarState,
} from '../useActiveSpace';
import { resolvePrototypeSidebarVariant } from '../../layouts/resolve-prototype-sidebar-variant';
import {
  HOME_LOCATION,
  HOME_PARENT,
  churchParent,
  isSameLocation,
  locationForSpace,
  locationFromStoredPair,
  parentForSpace,
  storedPairFromLocation,
} from '../../layouts/proto-location';

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

  it('shows My Church hub toolbar as a circular orb like My Home', () => {
    expect(
      resolveSpaceSwitcherToolbarState({
        space: null,
        spaceTitle: null,
        hasHome: true,
        myChurchMode: true,
        myChurchName: 'Testament Made',
      }),
    ).toEqual({
      showSharedSpaceToolbar: false,
      label: null,
      triggerTitle: 'My Church — Testament Made',
    });
  });
});

describe('resolvePrototypeSidebarVariant', () => {
  it('uses shared-space view on space layer regardless of list mode', () => {
    expect(
      resolvePrototypeSidebarVariant({
        isAdminRoute: false,
        isSharedSpace: true,
        sidebarLayer: 'space',
        location: { parent: HOME_PARENT, spaceId: 'space_shared_1' },
      }),
    ).toBe('shared-space');
  });

  it('uses scoped list sidebar on list layer for shared spaces', () => {
    expect(
      resolvePrototypeSidebarVariant({
        isAdminRoute: false,
        isSharedSpace: true,
        sidebarLayer: 'list',
        location: { parent: HOME_PARENT, spaceId: 'space_shared_1' },
      }),
    ).toBe('shared-list');
  });

  it('uses personal sidebar for My Home', () => {
    expect(
      resolvePrototypeSidebarVariant({
        isAdminRoute: false,
        isSharedSpace: false,
        sidebarLayer: 'space',
        location: { parent: HOME_PARENT, spaceId: 'space_home' },
      }),
    ).toBe('personal');
  });

  it('uses church-hub when My Church is active without a space', () => {
    expect(
      resolvePrototypeSidebarVariant({
        isAdminRoute: false,
        isSharedSpace: false,
        sidebarLayer: 'space',
        location: { parent: churchParent('org_1'), spaceId: null },
      }),
    ).toBe('church-hub');
  });

  it('prefers shared-space over church-hub when a channel is open', () => {
    expect(
      resolvePrototypeSidebarVariant({
        isAdminRoute: false,
        isSharedSpace: true,
        sidebarLayer: 'space',
        location: { parent: churchParent('org_1'), spaceId: 'space_ministry' },
      }),
    ).toBe('shared-space');
  });

  it('prefers admin sidebar on admin routes', () => {
    expect(
      resolvePrototypeSidebarVariant({
        isAdminRoute: true,
        isSharedSpace: true,
        sidebarLayer: 'space',
        location: { parent: HOME_PARENT, spaceId: 'space_shared_1' },
      }),
    ).toBe('admin');
  });
});

describe('parentForSpace', () => {
  it('puts a space with an orgId under that church', () => {
    // This is what replaced the old `keepChurch` argument: opening a ministry
    // channel lands you in church context because of where the channel lives,
    // not because the call site remembered to pass a flag.
    expect(parentForSpace({ orgId: 'org_1' })).toEqual({ kind: 'church', orgId: 'org_1' });
  });

  it('puts a space without an orgId under My Home', () => {
    expect(parentForSpace({ orgId: null })).toEqual(HOME_PARENT);
    expect(parentForSpace({})).toEqual(HOME_PARENT);
    expect(parentForSpace(null)).toEqual(HOME_PARENT);
  });

  it('treats a blank orgId as personal rather than a church with an empty id', () => {
    expect(parentForSpace({ orgId: '   ' })).toEqual(HOME_PARENT);
  });

  it('derives a full location from a space', () => {
    expect(locationForSpace({ id: 'space_1', orgId: 'org_1' })).toEqual({
      parent: { kind: 'church', orgId: 'org_1' },
      spaceId: 'space_1',
    });
    expect(locationForSpace({ id: 'space_2' })).toEqual({
      parent: HOME_PARENT,
      spaceId: 'space_2',
    });
    expect(locationForSpace(null)).toEqual(HOME_LOCATION);
  });
});

describe('location persistence round-trip', () => {
  it('preserves a church hub (church parent, no space)', () => {
    const location = { parent: churchParent('org_1'), spaceId: null };
    expect(locationFromStoredPair(storedPairFromLocation(location))).toEqual(location);
  });

  it('preserves a space inside a church', () => {
    const location = { parent: churchParent('org_1'), spaceId: 'space_ministry' };
    expect(locationFromStoredPair(storedPairFromLocation(location))).toEqual(location);
  });

  it('preserves a personal space and My Home', () => {
    const personal = { parent: HOME_PARENT, spaceId: 'space_shared_1' };
    expect(locationFromStoredPair(storedPairFromLocation(personal))).toEqual(personal);
    expect(locationFromStoredPair(storedPairFromLocation(HOME_LOCATION))).toEqual(HOME_LOCATION);
  });

  it('decodes a legacy stored pair written before the refactor', () => {
    // Storage kept its old shape deliberately, so sessions in flight survive.
    expect(
      locationFromStoredPair({ activeSpaceId: undefined, activeChurchOrgId: 'org_1' }),
    ).toEqual({ parent: churchParent('org_1'), spaceId: null });
    expect(
      locationFromStoredPair({ activeSpaceId: 'space_1', activeChurchOrgId: undefined }),
    ).toEqual({ parent: HOME_PARENT, spaceId: 'space_1' });
    expect(locationFromStoredPair({})).toEqual(HOME_LOCATION);
  });

  it('compares locations by value', () => {
    expect(isSameLocation(HOME_LOCATION, { parent: HOME_PARENT, spaceId: null })).toBe(true);
    expect(
      isSameLocation(
        { parent: churchParent('org_1'), spaceId: null },
        { parent: churchParent('org_2'), spaceId: null },
      ),
    ).toBe(false);
    expect(
      isSameLocation(HOME_LOCATION, { parent: churchParent('org_1'), spaceId: null }),
    ).toBe(false);
  });
});

describe('toolbar orbs stay symmetrical', () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

  // Both orbs are a fast view toggle when inactive and a menu trigger when
  // active. The value is the *symmetry* — if one orb switched layer on click
  // and the other opened a menu, the toolbar would feel arbitrary.
  it('the space switcher jumps to its layer when inactive', () => {
    const menu = source('spa/src/pages/prototype/SpaceSwitcherMenu.tsx');
    expect(menu).toContain("sidebarLayer !== 'space'");
    expect(menu).toContain("setSidebarLayer('space')");
  });

  it('the list view orb jumps to its layer when inactive', () => {
    const menu = source('spa/src/pages/prototype/ListViewMenu.tsx');
    expect(menu).toContain('isLayerToggle && !isActiveLayer');
    expect(menu).toContain("setSidebarLayer('list')");
  });

  it('both orbs expose the active layer as a readout', () => {
    // The two-mode click is only fair if you can see which mode you're in.
    expect(source('spa/src/pages/prototype/SpaceSwitcherMenu.tsx')).toContain('data-active');
    expect(source('spa/src/pages/prototype/ListViewMenu.tsx')).toContain('data-active');
  });

  it('no switcher selection leaves the menu open or carries the parent as a flag', () => {
    const menu = source('spa/src/pages/prototype/SpaceSwitcherMenu.tsx');
    expect(menu).not.toContain('keepOpen');
    expect(menu).not.toContain('keepChurch');
  });
});
