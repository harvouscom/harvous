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
import { useMemo, useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import ProtoSidebarExpandedPanel from './ProtoSidebarExpandedPanel';
import type { ExpandedSidebarToolProps } from './PrototypeExpandedSidebarHost';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import ProtoChipBar, { type ProtoChipOption } from './components/ProtoChipBar';
import { PrototypeListEmptyState } from './design-system';
import { toast } from '@/utils/toast';
import { DISCOVER_CATEGORIES, discoverCategoryLabel } from '@/data/discover-categories';
import { useDiscoverListings, type DiscoverListing } from '../../hooks/queries/useDiscoverListings';
import { useInstallDiscoverListing } from '../../hooks/mutations/useDiscoverMutations';

type KindTab = 'all' | 'template' | 'note' | 'pack';

const KIND_TABS: ProtoChipOption<KindTab>[] = [
  { id: 'all', label: 'Everything' },
  { id: 'template', label: 'Starters' },
  { id: 'note', label: 'Studies' },
  { id: 'pack', label: 'Series' },
];

/** What taking a copy of each kind actually produces, said before they tap. */
const KIND_NOUN: Record<string, string> = {
  template: 'Starter',
  note: 'Study',
  pack: 'Series',
  resource: 'Resource',
};

const KIND_ICON: Record<string, IconName> = {
  template: 'list-check',
  note: 'book',
  pack: 'layer-group',
  resource: 'link',
};

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
  const [kind, setKind] = useState<KindTab>('all');
  const [category, setCategory] = useState<string | null>(null);
  const listings = useDiscoverListings({ kind: kind === 'all' ? null : kind, category });
  const install = useInstallDiscoverListing();
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  const installed = useMemo(
    () => new Set(listings.data?.installedSlugs ?? []),
    [listings.data],
  );

  /* Only the categories that actually have something in them. A filter row of
     nine labels where seven lead to an empty list teaches people not to use it. */
  const categoryOptions = useMemo<ProtoChipOption<string>[]>(() => {
    const present = new Set(
      (listings.data?.listings ?? []).map((l) => l.category).filter(Boolean) as string[],
    );
    return [
      { id: '', label: 'All topics' },
      ...DISCOVER_CATEGORIES.filter((c) => present.has(c.id) || c.id === category).map((c) => ({
        id: c.id,
        label: c.label,
      })),
    ];
  }, [listings.data, category]);

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

  const rows = listings.data?.listings ?? [];

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
          <PrototypeListEmptyState
            iconName="list-check"
            title="Nothing shared yet"
            description="Once someone shares a starter or a study and it has been looked over, it turns up here."
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
                      <Icon name={KIND_ICON[listing.kind] ?? 'list-check'} size={13} />
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
