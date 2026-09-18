/**
 * Discover with room to look — what other people have offered, and a way to
 * take a copy.
 *
 * An expanded-sidebar tool rather than a route of its own, and that is the whole
 * point of it. The catalog's home is harvous.com: a page someone can find from
 * search, link to, and read without an account. What belongs *here* is the
 * moment inside the app where you want something you do not have — and a moment
 * is summoned from where it happens, the way the planner is opened from the
 * church hub and the space hub rather than from a nav item. A slug would have
 * made it a place you navigate to and come back from, which is the website's job.
 *
 * Adding an entry point is `openExpandedSidebar('discover', rect)` from wherever
 * the wanting happens; the layout, the grow-from-origin animation, and the
 * Back-button handling come from the host.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon, { type IconName } from '@/components/react/Icon';
import ProtoSidebarExpandedPanel from './ProtoSidebarExpandedPanel';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import {
  NOTE_TEMPLATE_ICON_NAME,
  resolveNoteTemplateIconColor,
} from '@/utils/note-template-icon';
import type { ExpandedSidebarToolProps } from './PrototypeExpandedSidebarHost';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import ProtoChipBar, { type ProtoChipOption } from './components/ProtoChipBar';
import ProtoSelectMenu, { type ProtoSelectOption } from './ProtoSelectMenu';
import {
  DISCOVER_RESOURCE_TYPE_ICON,
  DISCOVER_RESOURCE_TYPE_NOUN,
  discoverTopicIcon,
} from './discover-display';
import { PrototypeListEmptyState } from './design-system';
import { toast } from '@/utils/toast';
import {
  DISCOVER_CATEGORIES,
  discoverCategoryColor,
  discoverCategoryLabel,
} from '@/data/discover-categories';
import { useDiscoverListings, type DiscoverListing } from '../../hooks/queries/useDiscoverListings';
import { useInstallDiscoverListing } from '../../hooks/mutations/useDiscoverMutations';
import { consumePendingDiscoverKind } from '../../lib/pending-discover-kind';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { noteUrlForCurrentSurface } from '@/utils/url-helpers';
import {
  discoverInstallDestination,
  type DiscoverInstallDestination,
} from '../../lib/discover-install-destination';

type KindTab = 'all' | 'template' | 'resource' | 'note' | 'pack';

/*
 * The app's own words, not new ones.
 *
 * These were Starters / Studies / Series, which read well and named nothing:
 * the reader already calls them Templates, Notes and Threads everywhere else,
 * and a Discover row that arrives as a "Series" is a thing they then have to
 * translate. "Series" is worse than merely new — it is taken, by the church
 * planner's teaching series, so it would have named two different things.
 */
/*
 * Resources sit second, after Templates, in the order harvous.com/discover puts them — most of
 * the catalog is references, and a switch with no way to ask for only those made the one kind
 * the site leads with the one you could not pick out here.
 */
const KIND_TABS: ProtoChipOption<KindTab>[] = [
  { id: 'all', label: 'Everything' },
  { id: 'template', label: 'Templates' },
  /* "Resources", the word the library list and its tab already use — not
     "Links", which names the storage rather than the thing. Without this a
     shared resource could only ever be found by scrolling Everything.
     Once only: two merges each added it, and the bar showed it twice. */
  { id: 'resource', label: 'Resources' },
  { id: 'note', label: 'Notes' },
  { id: 'pack', label: 'Threads' },
];

/** What taking a copy of each kind actually produces, said before they tap. */
const KIND_NOUN: Record<string, string> = {
  template: 'Template',
  note: 'Note',
  pack: 'Thread',
  resource: 'Resource',
};

/**
 * The glyph each kind already wears elsewhere in the app — `noteKindIcon` for a
 * note, `PrototypeSidebarThreadCard`'s for a Thread, `NOTE_TEMPLATE_ICON_NAME`
 * for a template, and `PrototypeResourceLibraryList`'s for a library link.
 *
 * Worth stating because the first cut picked its own (`book` for a note,
 * `layer-group` for a Thread) and the panel ended up labelling things in a
 * vocabulary the rest of the app does not use.
 */
function listingIcon(listing: DiscoverListing): IconName {
  switch (listing.kind) {
    case 'template':
      return NOTE_TEMPLATE_ICON_NAME;
    case 'pack':
      return 'arrow-right-arrow-left';
    case 'resource':
      /* The type's own glyph where harvous.com gives one — a play button, a lexicon's lens —
         and the newspaper every other link wears. */
      return (
        (listing.preview?.resourceType && DISCOVER_RESOURCE_TYPE_ICON[listing.preview.resourceType]) ||
        'newspaper'
      );
    case 'note':
      if (listing.preview?.noteType === 'scripture') return 'book';
      if (listing.preview?.noteType === 'resource') return 'link';
      return 'note-sticky';
    default:
      return NOTE_TEMPLATE_ICON_NAME;
  }
}

/**
 * The tile colour for a row: the author's, then the topic's, then a hash.
 *
 * A template wears the colour its author picked, because a template *has* one —
 * the picker shows it, and the server resolves it onto the listing at submit.
 * Nothing else does. A Thread's `color` column is still on the table but the
 * app has not drawn a personal Thread in its own hue since
 * `proto-collection-card`, so reviving it only in the catalog would have
 * Discover speak a language the app retired.
 *
 * So the rest take their **topic's** hue, and the tile always means something —
 * *the author chose this*, or *this is what it is for*. Deliberately not the
 * reader's appearance setting: harvous.com is built statically with no viewer,
 * so the two products would disagree for every reader.
 *
 * `resolveNoteTemplateIconColor` still backstops an uncategorised listing with
 * its slug hash, so nothing is ever colourless.
 */
function listingIconColor(listing: DiscoverListing): string {
  /* A link stays grey. It is not something anyone wrote — it is a pointer
     somewhere else — and giving it a topic's hue put an authored-looking tile
     on the one row that is not authored. `--color-gray` is a neutral at the
     same lightness as the pastels, so it sits in the column without a hole. */
  if (listing.kind === 'resource') return 'gray';
  const category = discoverCategoryColor(listing.category);
  /* Reference is grey too — it is the shelf, not a kind of study. `gray` is not
     a thread colour, so `resolveNoteTemplateIconColor` would reject it and fall
     through to the slug hash. */
  if (!listing.preview?.iconColor && category === 'gray') return 'gray';
  return resolveNoteTemplateIconColor(listing.slug, listing.preview?.iconColor ?? category);
}

/**
 * What a row *is*, on a chip of its own — "Tool", "Guide", "Template".
 *
 * A resource says its type rather than "Resource": Blue Letter Bible's lexicons and a
 * five-minute how-to are both links, and only the type tells someone which one they are about to
 * save. The words are harvous.com's (see `discover-display`).
 */
function listingKindLabel(listing: DiscoverListing): string {
  if (listing.kind === 'resource' && listing.preview?.resourceType) {
    return DISCOVER_RESOURCE_TYPE_NOUN[listing.preview.resourceType] ?? KIND_NOUN.resource;
  }
  return KIND_NOUN[listing.kind] ?? 'Item';
}

function listingMeta(listing: DiscoverListing): string[] {
  /* The kind is on the chip now, so the line starts with who made it. */
  const meta: string[] = [];
  if (listing.authorDisplayName) meta.push(`by ${listing.authorDisplayName}`);
  if (listing.category) meta.push(discoverCategoryLabel(listing.category));
  if (listing.kind === 'pack') {
    const count = listing.preview?.noteCount;
    if (count) meta.push(`${count} notes`);
  }
  if (listing.installCount > 0) meta.push(`saved by ${listing.installCount}`);
  return meta;
}

export default function PrototypeExpandedDiscover({
  exiting,
  origin,
  onClose,
}: ExpandedSidebarToolProps) {
  /* Seeded from whichever list handed off, so arriving from Threads lands on
     series rather than on everything and a scroll. Read once, at mount. */
  const [kind, setKind] = useState<KindTab>(() => consumePendingDiscoverKind() ?? 'all');
  /* Any number of topics; none means all of them. */
  const [categories, setCategories] = useState<string[]>([]);
  /*
    One unfiltered fetch, filtered in memory.
    Asking the server per topic looked equivalent and was not: the topic list is
    built from whatever came back, so choosing one narrowed the response and the
    other topics vanished with it — you could only ever go between "All topics"
    and the one you were already in. Filtering here keeps every topic on offer
    while showing the rows for the ones chosen.
  */
  const listings = useDiscoverListings({});
  const install = useInstallDiscoverListing();
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const { isGuest } = useHarvousIdentity();
  const navigate = useNavigate();
  const { openLibraryPanel } = useProtoShell();

  const installed = useMemo(
    () => new Set(listings.data?.installedSlugs ?? []),
    [listings.data],
  );

  /** Everything of the selected kind — what the topic menu is drawn from. */
  const kindRows = useMemo(() => {
    const all = listings.data?.listings ?? [];
    return kind === 'all' ? all : all.filter((l) => l.kind === kind);
  }, [listings.data, kind]);

  /* Only the topics that actually have something in them, within the kind on
     screen. A list of nine labels where seven lead to an empty list teaches
     people not to use it. "All topics" is the menu's own clearing row. */
  const categoryOptions = useMemo<ProtoSelectOption<string>[]>(() => {
    const present = new Set(kindRows.map((l) => l.category).filter(Boolean) as string[]);
    return DISCOVER_CATEGORIES.filter((c) => present.has(c.id)).map((c) => ({
      value: c.id,
      label: c.label,
      /* The glyph each topic wears on harvous.com/discover, so the same topic is recognisable
         on both before its name is read. */
      icon: <Icon name={discoverTopicIcon(c.id)} size={13} aria-hidden />,
    }));
  }, [kindRows]);

  /* Changing kind can strip topics you had chosen — keeping them would filter
     by a topic the menu no longer offers, with no row left to untick it. */
  useEffect(() => {
    const offered = new Set(categoryOptions.map((option) => option.value));
    if (categories.some((c) => !offered.has(c))) {
      setCategories((prev) => prev.filter((c) => offered.has(c)));
    }
  }, [categoryOptions, categories]);

  /** Turn the resolver's descriptor into the navigation this surface can perform. */
  const openDestination = (destination: DiscoverInstallDestination) => {
    if (destination.kind === 'note') {
      void navigate({ to: noteUrlForCurrentSurface(destination.noteId) as never });
      return;
    }
    /* A Thread and the resource shelf both live inside the Library panel, so these
       open it rather than navigating anywhere. */
    if (destination.kind === 'thread') {
      openLibraryPanel({ tab: 'threads', drill: { kind: 'thread', threadId: destination.threadId } });
      return;
    }
    openLibraryPanel({ tab: 'resources', drill: null });
  };

  const handleInstall = async (listing: DiscoverListing) => {
    if (install.isPending) return;
    /*
     * A guest can read the catalog — it is public, and "here is study you can start
     * from" is the whole reason Discover is reachable without an account. What they
     * cannot do is install, so the tap goes to the listing's own page instead of a
     * 401 and a toast that says nothing. That page exists for exactly this: it parks
     * the slug, sends them to sign-up, and replays the install when they come back.
     */
    if (isGuest) {
      onClose();
      void navigate({ to: `/discover/${listing.slug}` as never });
      return;
    }
    setInstallingSlug(listing.slug);
    try {
      const result = await install.mutateAsync(listing.slug);
      const destination = discoverInstallDestination(result.createdIds);
      toast.success(
        result.alreadyInstalled
          ? `“${listing.title}” is already yours`
          : `Saved “${listing.title}” to your Harvous`,
        destination
          ? { action: { label: 'Open', onAction: () => openDestination(destination) } }
          : undefined,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that');
    } finally {
      setInstallingSlug(null);
    }
  };

  const rows = categories.length
    ? kindRows.filter((l) => Boolean(l.category) && categories.includes(l.category as string))
    : kindRows;

  return (
    <ProtoSidebarExpandedPanel
      label="Discover"
      title="Discover"
      scope={
        <ProtoChipBar
          ariaLabel="Which kind of thing to show"
          options={KIND_TABS}
          selectedId={kind}
          onSelect={setKind}
        />
      }
      /*
        Topics are a menu at the end of the kind row, not a second band of chips under it.
        Ten chips took a full line of the header before any content and still ran off the
        edge, and a topic is a filter you set once rather than a place you keep switching
        between. Several at once, because "sermon prep and teaching prep" is a real question.
      */
      actions={
        categoryOptions.length > 1 ? (
          <ProtoSelectMenu<string>
            multiple
            value={categories}
            onChange={setCategories}
            options={categoryOptions}
            label="Which topics to show"
            emptyLabel="All topics"
            countLabel={(count) => `${count} topics`}
          />
        ) : undefined
      }
      exiting={exiting}
      origin={origin}
      // Reached from the centered library panel, not from inside the sidebar itself — landing
      // left-anchored after that read as a jump sideways. See ProtoSidebarExpandedPanel's own
      // `centered` doc.
      centered
      onClose={onClose}
    >
      {/* The panel body is `display: flex` in row direction, so a bare child is
          sized to its own content and pins to the left — which is what the
          loading dots and the empty state were doing. `proto-planner` /
          `proto-planner__main` is the wrapper that makes the body a full-width
          column, and is what every other tool in this panel uses. */}
      <div className="proto-planner">
        <div className="proto-planner__main">
        {listings.isLoading ? (
          <ProtoSpaceLoading label="Loading Discover" />
        ) : rows.length === 0 ? (
          /* "Nothing shared yet" is only true of an empty catalog. With a kind
             selected it is the filter that is empty, and saying otherwise sends
             someone away from a catalog that does have things in it. */
          <PrototypeListEmptyState
            iconName="list-check"
            title={kind === 'all' ? 'Nothing shared yet' : `No ${KIND_TABS.find((t) => t.id === kind)?.label.toLowerCase()} yet`}
            description={
              kind === 'all'
                ? 'Once someone shares a starter or a study and it has been looked over, it turns up here.'
                : 'Try Everything to see what else people have shared.'
            }
          />
        ) : (
          /* The panel's own list idiom, not Home's rows: `PrototypeHomeRow` is
             built for a 260px column and collapses to its icons at this width. */
          <div className="proto-planner-list">
            <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
              {rows.map((listing) => {
                /* An official *template* ships with the app — it is already under
                   the browse sheet's "Included" tab, from `getBuiltInTemplates()` —
                   so it reads as already-yours here too. Tapping it would have
                   asked the server for a duplicate, which refuses as
                   `ALREADY_INCLUDED`; better not to offer the tap at all.

                   Kind-gated: only a template has that pre-installed twin. An
                   official note or pack has no `getBuiltInTemplates()` equivalent,
                   so treating it as already-installed here would hide the only way
                   to actually take it — the server would accept the install fine.

                   Never for a guest, who has no account for anything to be "in" —
                   their row stays tappable so it can still reach the sign-up page. */
                const isBuiltIn = listing.kind === 'template' && Boolean(listing.preview?.official);
                const isInstalled = !isGuest && (installed.has(listing.slug) || isBuiltIn);
                const busy = installingSlug === listing.slug;
                return (
                  <button
                    key={listing.slug}
                    type="button"
                    className="proto-church-tools__row proto-planner-list__row"
                    disabled={busy || isInstalled}
                    onClick={() => void handleInstall(listing)}
                    /* Said before the tap, not after: a guest's row goes to the
                       listing rather than into their account, and a label promising
                       "Save" would be describing someone else's session. */
                    aria-label={
                      isGuest
                        ? `Look at ${listing.title}`
                        : isInstalled
                          ? `${listing.title} is already yours`
                          : `Save ${listing.title} to your Harvous`
                    }
                  >
                    <span className="proto-church-tools__row-icon" aria-hidden>
                      <ProtoSpaceMenuIcon
                        color={listingIconColor(listing)}
                        iconName={listingIcon(listing)}
                        size={26}
                        radius={8}
                        glyphSize={12}
                      />
                    </span>
                    <span className="proto-church-tools__row-text">
                      <span
                        className="pds-list-title proto-church-tools__row-title proto-marquee"
                        title={listing.title}
                      >
                        {/* The kind rides the title's own line, right after the words — the
                            mark-on-the-title pattern `PrototypeHomeRow` uses for a status. It is
                            about the thing, not one more clause of the meta sentence under it. */}
                        <span>
                          {listing.title}
                          <span className="proto-list-panel__row-title-mark">
                            <span className="proto-discover-kind">{listingKindLabel(listing)}</span>
                          </span>
                        </span>
                      </span>
                      <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                        {[listing.description, ...listingMeta(listing)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="proto-church-tools__row-chevron" aria-hidden>
                      {/* `caret-right` for a guest, because the row goes somewhere —
                          the glyph this slot already wears for that everywhere else.
                          `plus` would promise a copy the tap cannot make. */}
                      <Icon
                        name={isGuest ? 'caret-right' : isInstalled ? 'check' : 'plus'}
                        size={11}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>
    </ProtoSidebarExpandedPanel>
  );
}
