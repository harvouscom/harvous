/**
 * Country- and region-scoped Here’s My Church typeahead
 * (calls Harvous proxy — no partner key in browser).
 */
import { useEffect, useId, useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  HMC_COUNTRIES,
  getHmcCountry,
  getHmcRegionsForCountry,
} from '@/utils/hmc-directory';
import {
  resolveDefaultHmcCountry,
  setLastHmcPickerCountry,
} from '@/utils/hmc-default-country';

export type HmcChurchPick = {
  id: string;
  shortId: string;
  name: string;
  city: string;
  state: string;
  address?: string | null;
  /** ISO country when known (from picker selection). */
  country?: string | null;
};

type Props = {
  /** Search via Harvous API (admin or user proxy). */
  onSearch: (q: string, region: string) => Promise<HmcChurchPick[]>;
  onPick: (church: HmcChurchPick) => void;
  /** Country not in the HMC directory → free-text path (settings). */
  onRequestOutsideDirectory?: () => void;
  /** Unlisted church in a directory country → HMC submit path (settings). */
  onRequestUnlisted?: (countryCode: string) => void;
  /** @deprecated Prefer onRequestOutsideDirectory */
  onRequestOutsideUs?: () => void;
  /** @deprecated Prefer onRequestUnlisted */
  onRequestUnlistedUs?: () => void;
  initialCountry?: string;
  initialRegion?: string;
  disabled?: boolean;
  /** Optional class prefix for admin vs settings styling. */
  variant?: 'admin' | 'settings';
};

export default function HmcChurchPicker({
  onSearch,
  onPick,
  onRequestOutsideDirectory,
  onRequestUnlisted,
  onRequestOutsideUs,
  onRequestUnlistedUs,
  initialCountry,
  initialRegion = '',
  disabled = false,
  variant = 'settings',
}: Props) {
  const listId = useId();
  const [country, setCountry] = useState(() => resolveDefaultHmcCountry(initialCountry));
  const [region, setRegion] = useState(initialRegion);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HmcChurchPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countryConfig = getHmcCountry(country);
  const regions = useMemo(() => getHmcRegionsForCountry(country), [country]);
  const regionNoun = countryConfig?.regionNoun.one ?? 'region';
  const regionNounTitle = regionNoun.charAt(0).toUpperCase() + regionNoun.slice(1);

  useEffect(() => {
    // Drop region when it doesn’t belong to the newly selected country.
    if (region && !regions.some((r) => r.code === region)) {
      setRegion('');
      setQuery('');
      setResults([]);
    }
  }, [country, region, regions]);

  useEffect(() => {
    if (!region || query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void onSearch(query.trim(), region)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setResults([]);
            setError(err instanceof Error ? err.message : 'Search failed');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, region, onSearch]);

  const inputClass =
    variant === 'admin'
      ? 'admin-publish__input'
      : 'proto-settings-field__input proto-create-folder-sheet__name-input';
  const selectClass =
    variant === 'admin'
      ? 'admin-publish__select'
      : 'proto-settings-field__input proto-create-folder-sheet__name-input';

  const requestOutside = onRequestOutsideDirectory ?? onRequestOutsideUs;
  const requestUnlisted = onRequestUnlisted
    ? () => onRequestUnlisted(country)
    : onRequestUnlistedUs
      ? () => onRequestUnlistedUs()
      : undefined;
  const showManualLinks = Boolean(requestOutside || requestUnlisted);

  return (
    <div className={`hmc-church-picker hmc-church-picker--${variant}`}>
      <label className={variant === 'admin' ? 'admin-publish__field' : 'proto-settings-field'}>
        <span className={variant === 'admin' ? 'admin-publish__label' : 'proto-settings-field__label'}>
          Country
        </span>
        <div className="hmc-church-picker__select-wrap">
          <select
            id={`${listId}-country`}
            className={`${selectClass} hmc-church-picker__select`}
            value={country}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value;
              setCountry(next);
              setLastHmcPickerCountry(next);
            }}
          >
            {HMC_COUNTRIES.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.name}
              </option>
            ))}
          </select>
          <span className="hmc-church-picker__select-chevron" aria-hidden>
            <Icon name="chevron-down" size={11} />
          </span>
        </div>
      </label>
      <label className={variant === 'admin' ? 'admin-publish__field' : 'proto-settings-field'}>
        <span className={variant === 'admin' ? 'admin-publish__label' : 'proto-settings-field__label'}>
          {regionNounTitle}
        </span>
        <div className="hmc-church-picker__select-wrap">
          <select
            id={`${listId}-region`}
            className={`${selectClass} hmc-church-picker__select`}
            value={region}
            disabled={disabled || !country}
            onChange={(e) => setRegion(e.target.value)}
          >
            <option value="">Select {regionNoun}…</option>
            {regions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.code.length <= 3 ? `${opt.code} — ${opt.label}` : opt.label}
              </option>
            ))}
          </select>
          <span className="hmc-church-picker__select-chevron" aria-hidden>
            <Icon name="chevron-down" size={11} />
          </span>
        </div>
      </label>
      <label className={variant === 'admin' ? 'admin-publish__field' : 'proto-settings-field'}>
        <span className={variant === 'admin' ? 'admin-publish__label' : 'proto-settings-field__label'}>
          Search churches
        </span>
        <div className="hmc-church-picker__search">
          <input
            id={`${listId}-q`}
            className={`${inputClass} hmc-church-picker__search-input`}
            type="search"
            value={query}
            disabled={disabled || !region}
            placeholder={region ? 'Type at least 2 characters…' : `Choose a ${regionNoun} first`}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              className="hmc-church-picker__clear"
              aria-label="Clear search"
              disabled={disabled || !region}
              onClick={() => {
                setQuery('');
                setResults([]);
                setError(null);
              }}
            >
              <Icon name="circle-xmark" size={15} aria-hidden />
            </button>
          ) : null}
        </div>
      </label>
      {loading ? (
        <div className="hmc-church-picker__status" role="status" aria-live="polite">
          <span className="sr-only">Searching</span>
          <span className="load-more-indicator" aria-hidden>
            <span className="load-more-indicator__dot" />
            <span className="load-more-indicator__dot" />
            <span className="load-more-indicator__dot" />
          </span>
        </div>
      ) : null}
      {error ? <p className="hmc-church-picker__error">{error}</p> : null}
      {results.length > 0 ? (
        <ul className="hmc-church-picker__results" role="listbox" aria-label="Church results">
          {results.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="hmc-church-picker__result"
                disabled={disabled}
                onClick={() => {
                  onPick({ ...row, country });
                  setQuery('');
                  setResults([]);
                }}
              >
                <span className="hmc-church-picker__result-name">{row.name}</span>
                <span className="hmc-church-picker__result-meta">
                  {row.city
                    ? [row.city, row.state].filter(Boolean).join(', ')
                    : [row.address, row.state].filter(Boolean).join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && !error && region && query.trim().length >= 2 && results.length === 0 ? (
        <p className="hmc-church-picker__status">
          No matches for “{query.trim()}” in {regions.find((r) => r.code === region)?.label ?? region}.
        </p>
      ) : null}
      {showManualLinks ? (
        <div className="hmc-church-picker__manual-links">
          {requestUnlisted ? (
            <button
              type="button"
              className="hmc-church-picker__manual-link"
              disabled={disabled}
              onClick={requestUnlisted}
            >
              Not in the directory
            </button>
          ) : null}
          {requestOutside ? (
            <button
              type="button"
              className="hmc-church-picker__manual-link"
              disabled={disabled}
              onClick={requestOutside}
            >
              Country not listed
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
