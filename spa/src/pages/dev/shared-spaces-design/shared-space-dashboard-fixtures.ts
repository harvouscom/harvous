import type { SpaceMemberRow, SpaceDetail } from '../../../hooks/queries/useSpace';
import type { HomePassageConnection, HomeTopThread } from '@/utils/prototype-home-trends';
import type { SharedSpaceNoteCardSlot, SharedSpaceSocialIntro } from '../../prototype/shared-space-dashboard';

const NOW = '2026-07-05T18:00:00.000Z';
const UNSEEN_SINCE = '2026-07-01T12:00:00.000Z';

function fixtureNote(
  id: string,
  overrides: Partial<import('../../../hooks/queries/useSpace').SpaceNoteRow> & {
    title?: string;
    authorDisplayName?: string;
    authorColor?: string;
  },
): import('../../../hooks/queries/useSpace').SpaceNoteRow {
  return {
    id: `note_${id}`,
    title: overrides.title ?? `Note ${id}`,
    content: overrides.content ?? '<p>Fixture preview content for the shared space dashboard.</p>',
    noteType: overrides.noteType ?? 'note',
    updatedAt: overrides.updatedAt ?? NOW,
    lastUpdated: overrides.lastUpdated ?? NOW,
    authorUserId: overrides.authorUserId,
    authorDisplayName: overrides.authorDisplayName,
    authorColor: overrides.authorColor,
    isOwnNote: overrides.isOwnNote,
    simpleNoteId: overrides.simpleNoteId ?? 12,
  };
}

function fixtureMember(
  userId: string,
  displayName: string,
  role: SpaceMemberRow['role'],
  userColor: string,
): SpaceMemberRow {
  return {
    userId,
    role,
    joinedAt: NOW,
    firstName: displayName.split(' ')[0] ?? displayName,
    lastName: null,
    displayName,
    email: null,
    profileImageUrl: null,
    userColor,
  };
}

export type SharedSpaceDashboardFixture = {
  spaceTitle: string;
  spaceColor: string;
  spaceDescription: string;
  spaceId: string;
  ownerId: string;
  isOwner: boolean;
  peopleCount: number;
  bannerNewCount: number;
  members: SpaceMemberRow[];
  contributorIntro: SharedSpaceSocialIntro | null;
  selfDisplayName: string;
  spotlightThread: HomeTopThread | null;
  topPassage: HomePassageConnection | null;
  noteCardSlots: SharedSpaceNoteCardSlot[];
  totalNoteCount: number;
  resolveAuthor: (note: import('../../../hooks/queries/useSpace').SpaceNoteRow) => {
    isOwn: boolean;
    authorName: string;
    authorColor: string;
  };
};

export function fixtureToSpaceDetail(fixture: SharedSpaceDashboardFixture): SpaceDetail {
  return {
    id: fixture.spaceId,
    title: fixture.spaceTitle,
    color: fixture.spaceColor,
    backgroundGradient: 'linear-gradient(135deg, #6b4c9a 0%, #9b7ec8 100%)',
    description: fixture.spaceDescription,
    ownerId: fixture.ownerId,
    memberCount: Math.max(0, fixture.peopleCount - 1),
    isPublic: false,
    type: 'shared',
    isOwner: fixture.isOwner,
  };
}

const AUTHORS = {
  self: { isOwn: true, authorName: 'You', authorColor: 'blue' },
  sarah: { isOwn: false, authorName: 'Sarah', authorColor: 'green' },
  james: { isOwn: false, authorName: 'James', authorColor: 'teal' },
} as const;

function resolveAuthor(note: import('../../../hooks/queries/useSpace').SpaceNoteRow) {
  if (note.isOwnNote || note.authorDisplayName === 'You') return AUTHORS.self;
  if (note.authorDisplayName === 'Sarah') return AUTHORS.sarah;
  if (note.authorDisplayName === 'James') return AUTHORS.james;
  return { isOwn: false, authorName: note.authorDisplayName ?? 'Member', authorColor: note.authorColor ?? 'blue' };
}

const ROMANS_MEMBERS: SpaceMemberRow[] = [
  fixtureMember('user_derek', 'Derek', 'owner', 'blue'),
  fixtureMember('user_sarah', 'Sarah', 'member', 'green'),
  fixtureMember('user_james', 'James', 'member', 'teal'),
  fixtureMember('user_elena', 'Elena', 'member', 'pink'),
];

/** Busy week — new-since banner, thread spotlight, passage, three note slots (no see-all). */
export const SHARED_SPACE_DASHBOARD_FIXTURE_FULL: SharedSpaceDashboardFixture = {
  spaceTitle: 'Romans Study Group',
  spaceColor: 'purple',
  spaceDescription: 'Weekly notes on Paul\u2019s letter \u2014 everyone adds observations and questions.',
  spaceId: 'space_fixture_romans',
  ownerId: 'user_derek',
  isOwner: true,
  peopleCount: 4,
  bannerNewCount: 5,
  members: ROMANS_MEMBERS,
  contributorIntro: null,
  selfDisplayName: 'Derek',
  spotlightThread: {
    id: 'note_thread_romans8',
    title: 'Spirit vs. flesh in Romans 8',
    noteCount: 6,
  },
  topPassage: {
    passageKey: 'Romans|8|1|11',
    displayRef: 'Romans 8:1\u201311',
    bookOrder: 45,
    chapter: 8,
    verseStart: 1,
    noteCount: 4,
  },
  noteCardSlots: [
    {
      kind: 'new-from-others',
      eyebrow: 'New since your last visit',
      note: fixtureNote('sarah-adoption', {
        title: 'Adoption as sons — Romans 8:15',
        authorUserId: 'user_sarah',
        authorDisplayName: 'Sarah',
        authorColor: 'green',
        isOwnNote: false,
        updatedAt: '2026-07-05T16:30:00.000Z',
        lastUpdated: '2026-07-05T16:30:00.000Z',
        content: '<p>The Spirit you received brought about your adoption. No longer slaves to fear.</p>',
      }),
    },
    {
      kind: 'continue',
      eyebrow: 'Pick up where you left off',
      note: fixtureNote('self-spirit', {
        title: 'Life in the Spirit — draft',
        authorUserId: 'user_self',
        authorDisplayName: 'You',
        authorColor: 'blue',
        isOwnNote: true,
        updatedAt: '2026-07-04T20:15:00.000Z',
        lastUpdated: '2026-07-04T20:15:00.000Z',
        content: '<p>Paul contrasts mind set on the flesh vs. the Spirit. Still working through v. 6\u20138.</p>',
      }),
    },
    {
      kind: 'recent',
      eyebrow: 'Recently updated',
      note: fixtureNote('james-groaning', {
        title: 'Creation groaning — Romans 8:22',
        authorUserId: 'user_james',
        authorDisplayName: 'James',
        authorColor: 'teal',
        isOwnNote: false,
        updatedAt: '2026-07-03T09:00:00.000Z',
        lastUpdated: '2026-07-03T09:00:00.000Z',
        content: '<p>All creation waits eagerly for the sons of God to be revealed.</p>',
      }),
    },
  ],
  totalNoteCount: 24,
  resolveAuthor,
};

/** Quiet day — social greeting instead of new-since banner; member view (no owner gear). */
export const SHARED_SPACE_DASHBOARD_FIXTURE_SOCIAL: SharedSpaceDashboardFixture = {
  spaceTitle: 'Acts Community',
  spaceColor: 'teal',
  spaceDescription: 'Walking through Acts together — one chapter at a time.',
  spaceId: 'space_fixture_acts',
  ownerId: 'user_marcus',
  isOwner: false,
  peopleCount: 3,
  bannerNewCount: 0,
  members: [
    fixtureMember('user_marcus', 'Marcus', 'owner', 'orange'),
    fixtureMember('user_elena', 'Elena', 'member', 'pink'),
    fixtureMember('user_derek', 'Derek', 'member', 'blue'),
  ],
  contributorIntro: {
    otherContributors: [
      { userId: 'user_marcus', displayName: 'Marcus', noteCount: 3 },
      { userId: 'user_elena', displayName: 'Elena', noteCount: 2 },
    ],
    ownRecentCount: 2,
    totalNoteCount: 12,
    hasMoreNotes: true,
  },
  selfDisplayName: 'Derek',
  spotlightThread: {
    id: 'note_thread_acts2',
    title: 'Pentecost and the Spirit',
    noteCount: 4,
  },
  topPassage: {
    passageKey: 'Acts|2|1|13',
    displayRef: 'Acts 2:1\u201313',
    bookOrder: 44,
    chapter: 2,
    verseStart: 1,
    noteCount: 3,
  },
  noteCardSlots: [
    {
      kind: 'recent',
      eyebrow: 'Recently updated',
      note: fixtureNote('marcus-peter', {
        title: 'Peter\u2019s sermon outline',
        authorUserId: 'user_marcus',
        authorDisplayName: 'Marcus',
        authorColor: 'orange',
        isOwnNote: false,
        content: '<p>Joel quote \u2192 Jesus as Lord and Christ. Structure for Sunday discussion.</p>',
      }),
    },
    {
      kind: 'continue',
      eyebrow: 'Pick up where you left off',
      note: fixtureNote('self-acts1', {
        title: 'Acts 1 — waiting for the promise',
        authorUserId: 'user_self',
        isOwnNote: true,
        content: '<p>They devoted themselves to prayer with the women and Mary the mother of Jesus.</p>',
      }),
    },
    {
      kind: 'recent',
      eyebrow: 'Recently updated',
      note: fixtureNote('elena-baptism', {
        title: '3,000 baptized',
        authorUserId: 'user_elena',
        authorDisplayName: 'Elena',
        authorColor: 'pink',
        isOwnNote: false,
        content: '<p>What does it mean that the Lord added to their number daily?</p>',
      }),
    },
  ],
  totalNoteCount: 12,
  resolveAuthor,
};

export const SHARED_SPACE_DASHBOARD_UNSEEN_SINCE = UNSEEN_SINCE;
