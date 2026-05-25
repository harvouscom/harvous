/**
 * Easton's Dictionary entry detail rendered inside the sidebar (drilldown from PrototypeDictionaryColumn).
 * Headword + category chip, body text, "See also" chips (clickable when slug resolves), public-domain disclaimer.
 */
import Icon from '@/components/react/Icon';
import {
  eastonsCategoryIconName,
  useEastonsEntry,
} from '../../hooks/queries/useEastonsEntries';
import { useEastonsSlugIndex, slugCandidates } from '../../hooks/useEastonsSlugIndex';

type Props = {
  slug: string;
  onBack: () => void;
  onNavigateSlug: (slug: string) => void;
};

export default function PrototypeDictionaryEntry({ slug, onBack, onNavigateSlug }: Props) {
  const entryQuery = useEastonsEntry(slug);
  const indexQuery = useEastonsSlugIndex();
  const entry = entryQuery.data;
  const categoryIcon = entry ? eastonsCategoryIconName(entry.category) : null;

  const resolveSeeAlsoSlug = (word: string): string | null => {
    const index = indexQuery.data;
    if (!index) return null;
    for (const candidate of slugCandidates(word)) {
      if (index.has(candidate)) return candidate;
    }
    return null;
  };

  return (
    <>
      <div style={{ padding: '0 18px 8px' }}>
        <button type="button" className="proto-sidebar-back-btn" onClick={onBack}>
          <Icon name="chevron-left" size={10} />
          Dictionary
        </button>
      </div>

      {entryQuery.isLoading ? (
        <p className="proto-caption" style={{ padding: '12px 18px' }}>Looking up…</p>
      ) : entryQuery.isError || !entry ? (
        <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
          Couldn't load entry. Check your connection and try again.
        </p>
      ) : (
        <div className="proto-dict-entry" style={{ padding: '0 18px 18px' }}>
          <div className="proto-dict-entry__header">
            <span className="proto-dict-entry__headword">{entry.headword}</span>
            {categoryIcon && entry.category ? (
              <span className="proto-dict-entry__category-chip">
                <Icon name={categoryIcon} size={11} aria-hidden />
                <span>{entry.category[0].toUpperCase() + entry.category.slice(1)}</span>
              </span>
            ) : null}
          </div>
          <p className="proto-dict-entry__body">{entry.body}</p>
          {entry.seeAlso.length > 0 ? (
            <div className="proto-dict-entry__see-also">
              <div className="proto-dict-entry__see-also-label">See also</div>
              <div className="proto-dict-entry__chip-flow">
                {entry.seeAlso.map((item) => {
                  const matched = resolveSeeAlsoSlug(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`proto-dict-chip${matched ? ' proto-dict-chip--linked' : ''}`}
                      disabled={!matched}
                      onClick={() => matched && onNavigateSlug(matched)}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <p className="proto-dict-entry__disclaimer">
            Easton's Bible Dictionary, 1897 · Public domain
          </p>
        </div>
      )}
    </>
  );
}
