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

type KindTab = 'all' | 'template' | 'note' | 'pack';

/*
 * The app's own words, not new ones.
 *
 * These were Starters / Studies / Series, which read well and named nothing:
 * the reader already calls them Templates, Notes and Threads everywhere else,
 * and a Discover row that arrives as a "Series" is a thing they then have to
 * translate. "Series" is worse than merely new — it is taken, by the church
 * planner's teaching series, so it would have named two different things.
 */
const KIND_TABS: ProtoChipOption<KindTab>[] = [
  { id: 'all', label: 'Everything' },
  { id: 'template', label: 'Templates' },
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
      return 'newspaper';
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

function listingMeta(listing: DiscoverListing): string[] {
  const meta = [KIND_NOUN[listing.kind] ?? 'Item'];
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
  const [category, setCategory] = useState<string | null>(null);
  /*
    One unfiltered fetch, filtered in memory.
    Asking the server per chip looked equivalent and was not: the topic chips are
    built from whatever came back, so selecting one narrowed the response and the
    other topics vanished with it — you could only ever go between "All topics"
    and the one you were already in. Filtering here keeps every topic on screen
    while showing the rows for one of them.
  */
  const listings = useDiscoverListings({});
  const install = useInstallDiscoverListing();
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  const installed = useMemo(
    () => new Set(listings.data?.installedSlugs ?? []),
    [listings.data],
  );

  /** Everything of the selected kind — what the topic chips are drawn from. */
  const kindRows = useMemo(() => {
    const all = listings.data?.listings ?? [];
    return kind === 'all' ? all : all.filter((l) => l.kind === kind);
  }, [listings.data, kind]);

  /* Only the topics that actually have something in them, within the kind on
     screen. A row of nine labels where seven lead to an empty list teaches
     people not to use it. */
  const categoryOptions = useMemo<ProtoChipOption<string>[]>(() => {
    const present = new Set(kindRows.map((l) => l.category).filter(Boolean) as string[]);
    return [
      { id: '', label: 'All topics' },
      ...DISCOVER_CATEGORIES.filter((c) => present.has(c.id)).map((c) => ({
        id: c.id,
        label: c.label,
      })),
    ];
  }, [kindRows]);

  /* Changing kind can strip the topic you were in — leaving it selected would
     show an empty list under a chip that is no longer there to un-press. */
  useEffect(() => {
    if (category && !categoryOptions.some((option) => option.id === category)) setCategory(null);
  }, [categoryOptions, category]);

  const handleInstall = async (listing: DiscoverListing) => {
    if (install.isPending) return;
    setInstallingSlug(listing.slug);
    try {
      const result = await install.mutateAsync(listing.slug);
      toast.success(
        result.alreadyInstalled
          ? `“${listing.title}” is already yours`
          : `Saved “${listing.title}” to your Harvous`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that');
    } finally {
      setInstallingSlug(null);
    }
  };

  const rows = category ? kindRows.filter((l) => l.category === category) : kindRows;

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
      toolbar={
        categoryOptions.length > 1 ? (
          <ProtoChipBar
            ariaLabel="Which topic to show"
            options={categoryOptions}
            selectedId={category ?? ''}
            onSelect={(next) => setCategory(next || null)}
          />
        ) : undefined
      }
      exiting={exiting}
      origin={origin}
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
                const isInstalled = installed.has(listing.slug);
                const busy = installingSlug === listing.slug;
                return (
                  <button
                    key={listing.slug}
                    type="button"
                    className="proto-church-tools__row proto-planner-list__row"
                    disabled={busy || isInstalled}
                    onClick={() => void handleInstall(listing)}
                    aria-label={
                      isInstalled
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
                        <span>{listing.title}</span>
                      </span>
                      <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                        {listing.description ? `${listing.description} · ` : ''}
                        {listingMeta(listing).join(' · ')}
                      </span>
                    </span>
                    <span className="proto-church-tools__row-chevron" aria-hidden>
                      <Icon name={isInstalled ? 'check' : 'plus'} size={11} />
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
