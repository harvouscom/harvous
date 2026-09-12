/**
 * The references Harvous curates for Discover.
 *
 * Not `BUILT_IN_TEMPLATES`, and deliberately not in anyone's library: these are
 * links to other people's work — BibleProject videos, public-domain commentary,
 * study tools — plus a few of our own guides. Installing one saves the link to
 * your own library, which is the whole point of listing them.
 *
 * `server/scripts/discover-seed-curated-resources.ts` publishes these straight
 * to `status: 'listed'`, the same way `discover-seed-builtin-templates.ts` does
 * and for the same reason: the publisher here is Harvous, so there is no
 * submitter to review.
 *
 * harvous.com holds the artwork — a mirrored poster and publisher mark per
 * slug, and the tone taken from that poster — because those are files on its
 * disk that this repo cannot know about. Everything a reader needs to be told
 * lives here.
 */

export type CuratedResourceType = 'video' | 'article' | 'book' | 'tool' | 'guide' | 'series';

export interface CuratedSource {
  /** As the publisher writes it — "BibleProject", not "bibleproject.com". */
  name: string;
  domain: string;
  /**
   * The exact page this points at, absolute.
   *
   * Absolute even for our own blog posts, which harvous.com writes as
   * `/blog/...`: this URL is what `prepareResourceInstall` saves to a library,
   * and `validateResourceUrl` rejects anything without a scheme and a dotted
   * host. The site pulls ours back to a relative path for its own links.
   */
  url: string;
  homeUrl: string;
  /** One sentence naming who made it and who owns it. */
  attribution: string;
  /** What the licence allows, in plain words. Shown under the CTA. */
  licence?: string;
  /** Never host this publisher's media — embed from their own platform. */
  embedOnly?: boolean;
}

export interface CuratedVideo {
  provider: 'youtube';
  /** The 11-character id, not a URL. */
  id: string;
  /** When the publisher put it out. Never when we listed it. */
  publishedAt?: string;
  /** ISO 8601, e.g. "PT8M56S". */
  duration?: string;
  /** What the badge shows, e.g. "8:56". */
  durationLabel?: string;
}

export interface CuratedResource {
  slug: string;
  title: string;
  description: string;
  /** A Discover category id. */
  category: string;
  resourceType: CuratedResourceType;
  /** Ours, not theirs — what makes the listing page more than a stub. */
  note: string;
  listedAt: string;
  source: CuratedSource;
  video?: CuratedVideo;
}

export const CURATED_RESOURCES: CuratedResource[] = [
  {
    slug: 'bibleproject-the-story-of-the-bible',
    title: 'The Story of the Bible',
    description: 'Six minutes on how the whole Bible holds together as one story, from the garden to the city.',
    category: 'reference',
    resourceType: 'video',
    note: 'Worth watching before a book study, not during one. It gives you the shape of the whole thing, so the book you are about to sit in has somewhere to sit. Write down the one thread you want to follow, and start there.',
    listedAt: '2026-09-10',
    source: {
      name: 'BibleProject',
      domain: 'bibleproject.com',
      url: 'https://bibleproject.com/videos/the-story-of-the-bible/',
      homeUrl: 'https://bibleproject.com/',
      attribution: 'BibleProject is the author and owner of this video. To find more BibleProject resources, visit bibleproject.com.',
      licence: 'Plays here from BibleProject\'s own YouTube channel. Free to watch, and no account needed.',
      embedOnly: true,
    },
    video: {
      provider: 'youtube',
      id: '7_CGP-12AE0',
      publishedAt: '2017-05-11T14:01:24-07:00',
      duration: 'PT6M8S',
      durationLabel: '6:08',
    },
  },
  {
    slug: 'bibleproject-genesis-1-11',
    title: 'Genesis 1–11',
    description: 'An animated overview of the Bible\'s first eleven chapters — creation, the garden, the flood, Babel — drawn as one story rather than four.',
    category: 'book-study',
    resourceType: 'video',
    note: 'We point people here when a book study starts in Genesis and those opening chapters read like separate episodes. Watch it once, then write down the thread you want to follow, and let the study start from that.',
    listedAt: '2026-09-10',
    source: {
      name: 'BibleProject',
      domain: 'bibleproject.com',
      url: 'https://bibleproject.com/videos/genesis-1-11/',
      homeUrl: 'https://bibleproject.com/',
      attribution: 'BibleProject is the author and owner of this video. To find more BibleProject resources, visit bibleproject.com.',
      licence: 'Plays here from BibleProject\'s own YouTube channel. Free to watch, and no account needed.',
      embedOnly: true,
    },
    video: {
      provider: 'youtube',
      id: 'GQI72THyO5I',
      publishedAt: '2015-12-30T06:15:00-08:00',
      duration: 'PT8M56S',
      durationLabel: '8:56',
    },
  },
  {
    slug: 'bibleproject-justice',
    title: 'Justice',
    description: 'What the Bible means by justice, traced as a theme from Genesis through to Jesus.',
    category: 'topical-study',
    resourceType: 'video',
    note: 'A good opener for a topical study, because it does the work of showing that the word carries more than one idea. Keep a note open while you watch and collect the passages it walks through — that list is most of your study already.',
    listedAt: '2026-09-10',
    source: {
      name: 'BibleProject',
      domain: 'bibleproject.com',
      url: 'https://bibleproject.com/videos/justice/',
      homeUrl: 'https://bibleproject.com/',
      attribution: 'BibleProject is the author and owner of this video. To find more BibleProject resources, visit bibleproject.com.',
      licence: 'Plays here from BibleProject\'s own YouTube channel. Free to watch, and no account needed.',
      embedOnly: true,
    },
    video: {
      provider: 'youtube',
      id: 'A14THPoc4-4',
      publishedAt: '2017-10-27T08:42:58-07:00',
      duration: 'PT6M2S',
      durationLabel: '6:02',
    },
  },
  {
    slug: 'guide-the-lesson-prep-stack',
    title: 'The lesson prep stack',
    description: 'A five-part shape for weekly lesson prep — passage, aim, questions, trail, return — with a template you can copy.',
    category: 'sermon-prep',
    resourceType: 'guide',
    note: 'Our own writing, filed here because it is the piece people come back to most. It ends with a template you can copy straight into a note.',
    listedAt: '2026-09-10',
    source: {
      name: 'Harvous',
      domain: 'harvous.com',
      url: 'https://harvous.com/blog/the-lesson-prep-stack/',
      homeUrl: 'https://harvous.com/blog/',
      attribution: 'Written for Bright Enough, the Harvous blog.',
    },
  },
  {
    slug: 'guide-the-five-minute-capture',
    title: 'The five-minute capture',
    description: 'What to write down right after you read, so the study you did this morning is still there next month.',
    category: 'daily-journal',
    resourceType: 'guide',
    note: 'The shortest way into a daily habit. Read it once and you have the whole idea; the rest is doing it.',
    listedAt: '2026-09-10',
    source: {
      name: 'Harvous',
      domain: 'harvous.com',
      url: 'https://harvous.com/blog/the-five-minute-capture/',
      homeUrl: 'https://harvous.com/blog/',
      attribution: 'Written for Bright Enough, the Harvous blog.',
    },
  },
  {
    slug: 'guide-plan-the-quarter-not-the-week',
    title: 'Plan the quarter, not the week',
    description: 'How to map a teaching quarter once, so each week\'s prep starts from a plan instead of a blank page.',
    category: 'teaching-prep',
    resourceType: 'guide',
    note: 'For anyone whose prep restarts from nothing every Tuesday. Read it before a term begins rather than in the middle of one.',
    listedAt: '2026-09-10',
    source: {
      name: 'Harvous',
      domain: 'harvous.com',
      url: 'https://harvous.com/blog/plan-the-quarter-not-the-week/',
      homeUrl: 'https://harvous.com/blog/',
      attribution: 'Written for Bright Enough, the Harvous blog.',
    },
  },
  {
    slug: 'bible-engagement-project-adults',
    title: 'Bible Engagement Project — adult curriculum',
    description: 'Small-group studies for adults, with every age group in a church following the same scope and sequence.',
    category: 'small-group',
    resourceType: 'series',
    note: 'Useful when a whole church wants to be in the same place at the same time. The overview page is open to read; the lessons themselves are behind a free account.',
    listedAt: '2026-09-10',
    source: {
      name: 'Bible Engagement Project',
      domain: 'bibleengagementproject.com',
      url: 'https://bibleengagementproject.com/Adults',
      homeUrl: 'https://bibleengagementproject.com/',
      attribution: 'Bible Engagement Project is the author and owner of this curriculum.',
      licence: 'The overview is open. The lessons need a free Bible Engagement Project account.',
    },
  },
  {
    slug: 'bible-engagement-project-downloads',
    title: 'Scope and sequence, as a PDF',
    description: 'The printable plans behind the Bible Engagement Project curriculum — what each age group covers, and when.',
    category: 'teaching-prep',
    resourceType: 'article',
    note: 'Worth a look even if you use something else entirely. Seeing three years mapped on one page is a good way to notice the gaps in your own plan.',
    listedAt: '2026-09-10',
    source: {
      name: 'Bible Engagement Project',
      domain: 'bibleengagementproject.com',
      url: 'https://bibleengagementproject.com/Downloads',
      homeUrl: 'https://bibleengagementproject.com/',
      attribution: 'Bible Engagement Project is the author and owner of these documents.',
      licence: 'Free to download, and no account needed.',
    },
  },
  {
    slug: 'blue-letter-bible-study-tools',
    title: 'Blue Letter Bible study tools',
    description: 'Interlinears, lexicons, concordances and commentaries, free and open to anyone.',
    category: 'reference',
    resourceType: 'tool',
    note: 'Where to go when a study turns on one word and you want to see it in the original. Keep it on the shelf rather than reading it through.',
    listedAt: '2026-09-10',
    source: {
      name: 'Blue Letter Bible',
      domain: 'blueletterbible.org',
      url: 'https://www.blueletterbible.org/study.cfm',
      homeUrl: 'https://www.blueletterbible.org/',
      attribution: 'Blue Letter Bible is the author and owner of these tools.',
      licence: 'Free to use, and no account needed.',
    },
  },
  {
    slug: 'matthew-henry-commentary',
    title: 'Matthew Henry\'s Commentary',
    description: 'The whole commentary on the whole Bible, written in the early 1700s and long out of copyright.',
    category: 'reference',
    resourceType: 'book',
    note: 'Old, warm, and still worth reading beside a passage you think you already know. Public domain, so you can quote it anywhere.',
    listedAt: '2026-09-10',
    source: {
      name: 'Christian Classics Ethereal Library',
      domain: 'ccel.org',
      url: 'https://www.ccel.org/ccel/henry/mhc.html',
      homeUrl: 'https://www.ccel.org/',
      attribution: 'Hosted by the Christian Classics Ethereal Library at Calvin University.',
      licence: 'Public domain.',
    },
  },
  {
    slug: 'bibleproject-gospel-of-mark',
    title: 'Gospel of Mark',
    description: 'The shortest gospel, drawn end to end — what Mark is arguing and how the pace of it carries the argument.',
    category: 'book-study',
    resourceType: 'video',
    note: 'Start a Mark study here rather than at chapter one. Nine minutes gives you the arc, and the arc is what stops week three feeling like a pile of disconnected miracles.',
    listedAt: '2026-09-10',
    source: {
      name: 'BibleProject',
      domain: 'bibleproject.com',
      url: 'https://bibleproject.com/videos/gospel-mark/',
      homeUrl: 'https://bibleproject.com/',
      attribution: 'BibleProject is the author and owner of this video. To find more BibleProject resources, visit bibleproject.com.',
      licence: 'Plays here from BibleProject\'s own YouTube channel. Free to watch, and no account needed.',
      embedOnly: true,
    },
    video: {
      provider: 'youtube',
      id: 'HGHqu9-DtXk',
      publishedAt: '2016-09-05T00:00:00Z',
      duration: 'PT9M31S',
      durationLabel: '9:31',
    },
  },
  {
    slug: 'bibleproject-exodus-1-18',
    title: 'Exodus 1–18',
    description: 'The first half of Exodus — slavery, the plagues, the sea — as one movement rather than a set of famous scenes.',
    category: 'book-study',
    resourceType: 'video',
    note: 'Useful when a group knows the stories but not the shape they sit in. Watch it, then ask what changes if these are one story instead of five.',
    listedAt: '2026-09-10',
    source: {
      name: 'BibleProject',
      domain: 'bibleproject.com',
      url: 'https://bibleproject.com/videos/exodus-1-18/',
      homeUrl: 'https://bibleproject.com/',
      attribution: 'BibleProject is the author and owner of this video. To find more BibleProject resources, visit bibleproject.com.',
      licence: 'Plays here from BibleProject\'s own YouTube channel. Free to watch, and no account needed.',
      embedOnly: true,
    },
    video: {
      provider: 'youtube',
      id: '0uf-PgW7rqE',
      publishedAt: '2014-11-28T00:00:00Z',
      duration: 'PT5M44S',
      durationLabel: '5:44',
    },
  },
  {
    slug: 'bibleproject-james',
    title: 'James',
    description: 'A short letter about what belief looks like when it reaches your hands, laid out whole.',
    category: 'book-study',
    resourceType: 'video',
    note: 'James is easy to quote and hard to hold together. This gives you the through-line, which is what a study of it needs before the memorable verses take over.',
    listedAt: '2026-09-10',
    source: {
      name: 'BibleProject',
      domain: 'bibleproject.com',
      url: 'https://bibleproject.com/videos/james/',
      homeUrl: 'https://bibleproject.com/',
      attribution: 'BibleProject is the author and owner of this video. To find more BibleProject resources, visit bibleproject.com.',
      licence: 'Plays here from BibleProject\'s own YouTube channel. Free to watch, and no account needed.',
      embedOnly: true,
    },
    video: {
      provider: 'youtube',
      id: 'qn-hLHWwRYY',
      publishedAt: '2016-12-05T00:00:00Z',
      duration: 'PT8M2S',
      durationLabel: '8:02',
    },
  },
  {
    slug: 'bibleproject-new-testament-overview',
    title: 'The New Testament',
    description: 'How the whole New Testament fits together — gospels, Acts, letters, Revelation — in eight minutes.',
    category: 'reference',
    resourceType: 'video',
    note: 'The companion to the whole-Bible video. Worth keeping on the shelf for the week someone asks why the letters are in that order.',
    listedAt: '2026-09-10',
    source: {
      name: 'BibleProject',
      domain: 'bibleproject.com',
      url: 'https://bibleproject.com/videos/new-testament-overview/',
      homeUrl: 'https://bibleproject.com/',
      attribution: 'BibleProject is the author and owner of this video. To find more BibleProject resources, visit bibleproject.com.',
      licence: 'Plays here from BibleProject\'s own YouTube channel. Free to watch, and no account needed.',
      embedOnly: true,
    },
    video: {
      provider: 'youtube',
      id: 'Q0BrP8bqj0c',
      publishedAt: '2018-09-20T00:00:00Z',
      duration: 'PT8M17S',
      durationLabel: '8:17',
    },
  },
  {
    slug: 'bibleproject-sacrifice-and-atonement',
    title: 'Sacrifice and atonement',
    description: 'What the sacrificial system was actually for, and how the New Testament reads Jesus\' death through it.',
    category: 'topical-study',
    resourceType: 'video',
    note: 'A good opener for a topical study that would otherwise stall on unfamiliar ritual. Collect the passages it walks through and you have most of your outline.',
    listedAt: '2026-09-10',
    source: {
      name: 'BibleProject',
      domain: 'bibleproject.com',
      url: 'https://bibleproject.com/videos/sacrifice-and-atonement/',
      homeUrl: 'https://bibleproject.com/',
      attribution: 'BibleProject is the author and owner of this video. To find more BibleProject resources, visit bibleproject.com.',
      licence: 'Plays here from BibleProject\'s own YouTube channel. Free to watch, and no account needed.',
      embedOnly: true,
    },
    video: {
      provider: 'youtube',
      id: 'G_OlRWGLdnw',
      publishedAt: '2015-08-27T00:00:00Z',
      duration: 'PT6M50S',
      durationLabel: '6:50',
    },
  },
  {
    slug: 'bibleproject-job',
    title: 'Job',
    description: 'The design of Job — the frame story, the speeches, and what the book is really asking about how God runs the world.',
    category: 'deep-study',
    resourceType: 'video',
    note: 'Job punishes a chapter-a-day approach. Watch this first so you know which speeches are meant to be wrong, then slow down.',
    listedAt: '2026-09-10',
    source: {
      name: 'BibleProject',
      domain: 'bibleproject.com',
      url: 'https://bibleproject.com/videos/job/',
      homeUrl: 'https://bibleproject.com/',
      attribution: 'BibleProject is the author and owner of this video. To find more BibleProject resources, visit bibleproject.com.',
      licence: 'Plays here from BibleProject\'s own YouTube channel. Free to watch, and no account needed.',
      embedOnly: true,
    },
    video: {
      provider: 'youtube',
      id: 'GswSg2ohqmA',
      publishedAt: '2016-10-22T00:00:00Z',
      duration: 'PT7M14S',
      durationLabel: '7:14',
    },
  },
  {
    slug: 'guide-prep-a-lesson-that-leaves-a-trail',
    title: 'Prep a lesson that leaves a trail',
    description: 'How to prepare so the study survives the week — for you and for the people you taught.',
    category: 'sermon-prep',
    resourceType: 'guide',
    note: 'The companion to the lesson prep stack: that one gives you the shape, this one gives you what to do with it afterwards.',
    listedAt: '2026-09-10',
    source: {
      name: 'Harvous',
      domain: 'harvous.com',
      url: 'https://harvous.com/blog/prep-a-lesson-that-leaves-a-trail/',
      homeUrl: 'https://harvous.com/blog/',
      attribution: 'Written for Bright Enough, the Harvous blog.',
    },
  },
  {
    slug: 'guide-asking-better-questions',
    title: 'Asking better questions in class and group',
    description: 'Why the questions you plan matter more than the answers you prepared, and how to write ones that open a room.',
    category: 'small-group',
    resourceType: 'guide',
    note: 'Read it the week before a term starts. It changes what you write in the questions section of your prep, which is the part most likely to be filled in last.',
    listedAt: '2026-09-10',
    source: {
      name: 'Harvous',
      domain: 'harvous.com',
      url: 'https://harvous.com/blog/asking-better-questions-in-class-and-group/',
      homeUrl: 'https://harvous.com/blog/',
      attribution: 'Written for Bright Enough, the Harvous blog.',
    },
  },
  {
    slug: 'guide-the-monday-retention-loop',
    title: 'The Monday retention loop',
    description: 'What to do on Monday so that Sunday\'s teaching is still doing something on Thursday.',
    category: 'sermon-notes',
    resourceType: 'guide',
    note: 'For anyone who has watched a good Sunday evaporate by midweek. Short, and the loop it describes takes about ten minutes to run.',
    listedAt: '2026-09-10',
    source: {
      name: 'Harvous',
      domain: 'harvous.com',
      url: 'https://harvous.com/blog/the-monday-retention-loop/',
      homeUrl: 'https://harvous.com/blog/',
      attribution: 'Written for Bright Enough, the Harvous blog.',
    },
  },
  {
    slug: 'guide-teaching-through-a-book',
    title: 'Teaching through a book',
    description: 'Planning a series that walks through one book — where to break it, and what to keep visible across weeks.',
    category: 'teaching-prep',
    resourceType: 'guide',
    note: 'Pair it with a BibleProject overview of the book you are about to teach. One gives you the arc, the other gives you the weeks.',
    listedAt: '2026-09-10',
    source: {
      name: 'Harvous',
      domain: 'harvous.com',
      url: 'https://harvous.com/blog/teaching-through-a-book/',
      homeUrl: 'https://harvous.com/blog/',
      attribution: 'Written for Bright Enough, the Harvous blog.',
    },
  },
  {
    slug: 'spurgeon-morning-and-evening',
    title: 'Morning and Evening',
    description: 'Spurgeon\'s daily readings, two for every day of the year, written in the 1860s.',
    category: 'daily-journal',
    resourceType: 'book',
    note: 'A daily devotional that is genuinely old and genuinely short. Useful as a second voice beside your own reading rather than as a replacement for it.',
    listedAt: '2026-09-10',
    source: {
      name: 'Christian Classics Ethereal Library',
      domain: 'ccel.org',
      url: 'https://www.ccel.org/ccel/spurgeon/morneve.html',
      homeUrl: 'https://www.ccel.org/',
      attribution: 'Hosted by the Christian Classics Ethereal Library at Calvin University.',
      licence: 'Public domain.',
    },
  },
  {
    slug: 'augustine-confessions',
    title: 'Augustine\'s Confessions',
    description: 'The fourth-century autobiography that reads as one long prayer, in full.',
    category: 'deep-study',
    resourceType: 'book',
    note: 'Slow reading, and worth it. Keep a note open for the sentences you will want again — there are more of them than you expect.',
    listedAt: '2026-09-10',
    source: {
      name: 'Christian Classics Ethereal Library',
      domain: 'ccel.org',
      url: 'https://www.ccel.org/ccel/augustine/confessions.html',
      homeUrl: 'https://www.ccel.org/',
      attribution: 'Hosted by the Christian Classics Ethereal Library at Calvin University.',
      licence: 'Public domain.',
    },
  },
  {
    slug: 'bible-engagement-project-kids',
    title: 'Bible Engagement Project — kids',
    description: 'Kids\' curriculum that follows the same scope and sequence as the adult and youth material.',
    category: 'teaching-prep',
    resourceType: 'series',
    note: 'Worth a look if your children\'s ministry and your adult classes are currently in unrelated places in the Bible on the same Sunday.',
    listedAt: '2026-09-10',
    source: {
      name: 'Bible Engagement Project',
      domain: 'bibleengagementproject.com',
      url: 'https://bibleengagementproject.com/Kids',
      homeUrl: 'https://bibleengagementproject.com/',
      attribution: 'Bible Engagement Project is the author and owner of this curriculum.',
      licence: 'The overview is open. The lessons need a free Bible Engagement Project account.',
    },
  },
  {
    slug: 'step-bible',
    title: 'STEP Bible',
    description: 'Interlinears, lexicons and morphology from Tyndale House, Cambridge — open, and free of charge.',
    category: 'reference',
    resourceType: 'tool',
    note: 'The one to reach for when a study turns on a single word and you want to see it in Greek or Hebrew without owning software. Keep it on the shelf; do not try to read it through.',
    listedAt: '2026-09-10',
    source: {
      name: 'STEP Bible',
      domain: 'stepbible.org',
      url: 'https://www.stepbible.org/',
      homeUrl: 'https://www.stepbible.org/',
      attribution: 'STEP Bible is made by Tyndale House, Cambridge.',
      licence: 'Free to use, and no account needed.',
    },
  },
  {
    slug: 'openbible-topics',
    title: 'Bible topics, indexed',
    description: 'A topical index built from cross-reference data — what the whole Bible says on a subject, ranked and linked.',
    category: 'topical-study',
    resourceType: 'tool',
    note: 'A fast way to gather the passages before a topical study rather than working from the ones you already remember. Check what it gives you in context; an index cannot do that part.',
    listedAt: '2026-09-10',
    source: {
      name: 'OpenBible.info',
      domain: 'openbible.info',
      url: 'https://www.openbible.info/topics/',
      homeUrl: 'https://www.openbible.info/',
      attribution: 'OpenBible.info is the author of this index.',
      licence: 'Free, and the underlying data is Creative Commons licensed.',
    },
  },
  {
    slug: 'working-preacher-bible-index',
    title: 'Commentary, book by book',
    description: 'Free scholarly commentary on each passage, written weekly by biblical scholars at Luther Seminary.',
    category: 'sermon-prep',
    resourceType: 'tool',
    note: 'Where to go on a Tuesday when the passage is not opening. Written for people who have to say something useful about it on Sunday, which is a different job from a study Bible\'s.',
    listedAt: '2026-09-10',
    source: {
      name: 'Working Preacher',
      domain: 'workingpreacher.org',
      url: 'https://www.workingpreacher.org/bible-index',
      homeUrl: 'https://www.workingpreacher.org/',
      attribution: 'Working Preacher is published by Luther Seminary.',
      licence: 'Free to read, and no account needed.',
    },
  },
  {
    slug: 'working-preacher-craft-of-preaching',
    title: 'The craft of preaching',
    description: 'Essays on the work itself — shaping a sermon, reading a room, and keeping going over years.',
    category: 'teaching-prep',
    resourceType: 'article',
    note: 'Less about this week\'s text and more about how you do the job. Worth reading in a quiet week rather than a busy one.',
    listedAt: '2026-09-10',
    source: {
      name: 'Working Preacher',
      domain: 'workingpreacher.org',
      url: 'https://www.workingpreacher.org/craft-of-preaching',
      homeUrl: 'https://www.workingpreacher.org/',
      attribution: 'Working Preacher is published by Luther Seminary.',
      licence: 'Free to read, and no account needed.',
    },
  },
  {
    slug: 'tgc-courses',
    title: 'Free courses',
    description: 'A library of video courses on books of the Bible, theology and teaching — free to watch.',
    category: 'teaching-prep',
    resourceType: 'series',
    note: 'Course-shaped rather than article-shaped, so it suits a term of preparation better than a single week. Worth knowing it is written from a Reformed evangelical position.',
    listedAt: '2026-09-10',
    source: {
      name: 'The Gospel Coalition',
      domain: 'thegospelcoalition.org',
      url: 'https://www.thegospelcoalition.org/course/',
      homeUrl: 'https://www.thegospelcoalition.org/',
      attribution: 'The Gospel Coalition is the author and owner of these courses.',
      licence: 'Free to watch. Some courses ask for a free account.',
    },
  },
  {
    slug: 'ligonier-dust-to-glory',
    title: 'Dust to Glory',
    description: 'R.C. Sproul\'s survey of the whole Bible, Genesis to Revelation, in fifty-seven parts.',
    category: 'book-study',
    resourceType: 'series',
    note: 'A long walk rather than a lookup. Good as the spine of a year-long study, with a shorter overview alongside it for each book you reach.',
    listedAt: '2026-09-10',
    source: {
      name: 'Ligonier Ministries',
      domain: 'ligonier.org',
      url: 'https://www.ligonier.org/learn/series/dust-to-glory',
      homeUrl: 'https://www.ligonier.org/',
      attribution: 'Dust to Glory is taught by R.C. Sproul and owned by Ligonier Ministries.',
      licence: 'Free to stream. Written from a Reformed position.',
    },
  },
];
