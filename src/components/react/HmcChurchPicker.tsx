/**
 * State-scoped Here’s My Church typeahead (calls Harvous proxy — no partner key in browser).
 */
import { useEffect, useId, useState } from 'react';
import { US_STATE_OPTIONS } from '@/utils/us-states';

export type HmcChurchPick = {
  id: string;
  shortId: string;
  name: string;
  city: string;
  state: string;
  address?: string | null;
};

type Props = {
  /** Search via Harvous API (admin or user proxy). */
  onSearch: (q: string, state: string) => Promise<HmcChurchPick[]>;
  onPick: (church: HmcChurchPick) => void;
  /** Outside-US / unlisted fallback (settings). */
  onRequestManual?: () => void;
  initialState?: string;
  disabled?: boolean;
  /** Optional class prefix for admin vs settings styling. */
  variant?: 'admin' | 'settings';
};

export default function HmcChurchPicker({
  onSearch,
  onPick,
  onRequestManual,
  initialState = '',
  disabled = false,
  variant = 'settings',
}: Props) {
  const listId = useId();
  const [state, setState] = useState(initialState);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HmcChurchPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state || query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void onSearch(query.trim(), state)
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
  }, [query, state, onSearch]);

  const inputClass =
    variant === 'admin'
      ? 'admin-publish__input'
      : 'proto-settings-field__input proto-create-folder-sheet__name-input';
  const selectClass =
    variant === 'admin'
      ? 'admin-publish__select'
      : 'proto-settings-field__input proto-create-folder-sheet__name-input';

  return (
    <div className={`hmc-church-picker hmc-church-picker--${variant}`}>
      <label className={variant === 'admin' ? 'admin-publish__field' : 'proto-settings-field'}>
        <span className={variant === 'admin' ? 'admin-publish__label' : 'proto-settings-field__label'}>
          State
        </span>
        <select
          id={`${listId}-state`}
          className={selectClass}
          value={state}
          disabled={disabled}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">Select state…</option>
          {US_STATE_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.code} — {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className={variant === 'admin' ? 'admin-publish__field' : 'proto-settings-field'}>
        <span className={variant === 'admin' ? 'admin-publish__label' : 'proto-settings-field__label'}>
          Search churches
        </span>
        <input
          id={`${listId}-q`}
          className={inputClass}
          type="search"
          value={query}
          disabled={disabled || !state}
          placeholder={state ? 'Type at least 2 characters…' : 'Choose a state first'}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </label>
      {loading ? <p className="hmc-church-picker__status">Searching…</p> : null}
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
                  onPick(row);
                  setQuery('');
                  setResults([]);
                }}
              >
                <span className="hmc-church-picker__result-name">{row.name}</span>
                <span className="hmc-church-picker__result-meta">
                  {[row.city, row.state].filter(Boolean).join(', ')}
                  {row.address ? ` · ${row.address}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && !error && state && query.trim().length >= 2 && results.length === 0 ? (
        <p className="hmc-church-picker__status">No matches for “{query.trim()}” in {state}.</p>
      ) : null}
      {onRequestManual ? (
        <button
          type="button"
          className="hmc-church-picker__manual-link"
          disabled={disabled}
          onClick={onRequestManual}
        >
          Outside the U.S. or not listed? Enter manually
        </button>
      ) : null}
    </div>
  );
}
