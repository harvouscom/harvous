/**
 * `/discover` — what other people have offered, and a way to take a copy.
 *
 * A page rather than a tab in the Library panel, which is where the plan first
 * put it. That panel's whole vocabulary is *my Harvous*: its tab union is the
 * sidebar's own filter, and ten call sites — selection, search results, the
 * create footer, nav — read every tab as a corpus the reader already owns.
 * Discover is the one thing in the product that is nobody's yet, so it would
 * have arrived as a special case in each of them.
 *
 * The templates chip in the browse sheet stays exactly where it is. It answers
 * a different question — "I am writing now and want a starting shape" — and the
 * plan's argument for keeping it out of a route still holds. This page answers
 * "what is there", which is a browsing question and wants a place to stand.
 */
import { useMemo, useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import ProtoChipBar, { type ProtoChipOption } from './components/ProtoChipBar';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeRow from './PrototypeHomeRow';
import { PrototypeListEmptyState } from './design-system';
import { toast } from '@/utils/toast';
import { DISCOVER_CATEGORIES, discoverCategoryLabel } from '@/data/discover-categories';
import {
  useDiscoverListings,
  type DiscoverListing,
} from '../../hooks/queries/useDiscoverListings';
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
    const count = (listing.preview as { noteCount?: number } | null)?.noteCount;
    if (count) meta.push(`${count} notes`);
  }
  if (listing.installCount > 0) meta.push(`saved by ${listing.installCount}`);
  return meta;
}

export default function PrototypeDiscoverPage() {
  const [kind, setKind] = useState<KindTab>('all');
  const [category, setCategory] = useState<string | null>(null);
  const listings = useDiscoverListings({
    kind: kind === 'all' ? null : kind,
    category,
  });
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
    <div className="proto-feed">
      <article className="proto-feed-sheet">
        <header className="proto-feed-sheet__head">
          <div className="proto-feed-sheet__title">
            <h2 className="proto-feed-sheet__day">Discover</h2>
          </div>
        </header>
        <div className="proto-feed-sheet__body">
          <p className="proto-feed-sheet__rest">
            Starters, studies and series people have offered to share. Everything here is
            free, and taking a copy makes it yours to change.
          </p>

          <ProtoChipBar
            ariaLabel="Which kind of thing to show"
            options={KIND_TABS}
            selectedId={kind}
            onSelect={setKind}
          />
          {categoryOptions.length > 1 ? (
            <ProtoChipBar
              ariaLabel="Which topic to show"
              options={categoryOptions}
              selectedId={category ?? ''}
              onSelect={(next) => setCategory(next || null)}
            />
          ) : null}

          {listings.isLoading ? (
            <ProtoSpaceLoading />
          ) : rows.length === 0 ? (
            <PrototypeListEmptyState
              iconName="list-check"
              title="Nothing shared yet"
              description="Once someone shares a starter or a study and it has been looked over, it turns up here."
            />
          ) : (
            <PrototypeHomeSection title={`${rows.length} to look at`}>
              {rows.map((listing) => {
                const isInstalled = installed.has(listing.slug);
                const busy = installingSlug === listing.slug;
                return (
                  <PrototypeHomeRow
                    key={listing.slug}
                    icon={KIND_ICON[listing.kind] ?? 'list-check'}
                    title={listing.title}
                    meta={[
                      ...(listing.description ? [listing.description] : []),
                      ...listingMeta(listing),
                    ]}
                    chevron={false}
                    disabled={busy}
                    onClick={isInstalled ? undefined : () => void handleInstall(listing)}
                    aria-label={
                      isInstalled
                        ? `${listing.title} is already yours`
                        : `Save ${listing.title} to your Harvous`
                    }
                    trailing={
                      <span className="proto-list-panel__row-icon" aria-hidden>
                        <Icon name={isInstalled ? 'check' : 'plus'} size={13} />
                      </span>
                    }
                  />
                );
              })}
            </PrototypeHomeSection>
          )}
        </div>
      </article>
    </div>
  );
}
