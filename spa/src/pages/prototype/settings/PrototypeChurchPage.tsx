import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useNavigation } from '../../../hooks/queries/useNavigation';
import { useUpdateChurch } from '../../../hooks/mutations/useUpdateChurch';
import { formatChurchLocation, staffedChurchSharedSpaces } from '../../../lib/church-settings';
import { SettingsGroup, SettingsRow, SettingsShell } from './SettingsShell';
import { ErrorText } from './account/accountShared';
import HmcChurchPicker, { type HmcChurchPick } from '@/components/react/HmcChurchPicker';
import Icon from '@/components/react/Icon';
import { api } from '../../../lib/api';
import { US_STATE_OPTIONS, isUnitedStatesCountryLabel } from '@/utils/us-states';

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="pds-inspector-label"
      style={{ padding: '0 0 6px', textTransform: 'uppercase', color: 'var(--pds-text-tertiary)' }}
    >
      {children}
    </div>
  );
}

function spaceChurchSublabel(space: {
  churchName?: string | null;
  churchCity?: string | null;
  churchState?: string | null;
}): string | undefined {
  const location = formatChurchLocation(space);
  const name = space.churchName?.trim() || '';
  if (name && location) return `${name} · ${location}`;
  if (name) return name;
  if (location) return location;
  return undefined;
}

async function searchUserHmcChurches(q: string, state: string): Promise<HmcChurchPick[]> {
  const params = new URLSearchParams({ q, state, limit: '20' });
  const data = await api.get<{ success: boolean; results: HmcChurchPick[] }>(
    `/api/user/churches/hmc/search?${params.toString()}`,
  );
  return data.results ?? [];
}

type EntryMode = 'directory' | 'outside_us' | 'unlisted_us';

export default function PrototypeChurchPage() {
  const { data: profile } = useProfile();
  const { data: nav } = useNavigation();
  const updateChurch = useUpdateChurch();

  const [hydrated, setHydrated] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>('directory');
  const [hmcChurchId, setHmcChurchId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftCity, setDraftCity] = useState('');
  const [draftRegion, setDraftRegion] = useState('');
  const [draftCountry, setDraftCountry] = useState('');

  const ledSharedSpaces = useMemo(
    () => staffedChurchSharedSpaces(nav),
    [nav],
  );

  useEffect(() => {
    if (hydrated || !profile) return;
    setHmcChurchId(profile.hmcChurchId ?? null);
    setName(profile.churchName ?? '');
    setCity(profile.churchCity ?? '');
    setState(profile.churchState ?? '');
    setCountry(profile.churchCountry ?? '');
    setHydrated(true);
  }, [profile, hydrated]);

  const searchHmc = useCallback((q: string, st: string) => searchUserHmcChurches(q, st), []);

  const location = formatChurchLocation({
    churchCity: city,
    churchState: state,
    churchCountry: country,
  });

  const hasChurch = Boolean(hmcChurchId || name);

  const openDraft = (mode: 'outside_us' | 'unlisted_us') => {
    setDraftName('');
    setDraftCity('');
    setDraftRegion('');
    setDraftCountry('');
    setEntryMode(mode);
  };

  const applyChurchFromResponse = (
    data: {
      church?: {
        hmcChurchId?: string | null;
        churchName?: string | null;
        churchCity?: string | null;
        churchState?: string | null;
        churchCountry?: string | null;
      };
    },
    fallback: {
      hmcChurchId?: string | null;
      name: string;
      city: string;
      state: string;
      country: string;
    },
  ) => {
    setHmcChurchId(data.church?.hmcChurchId ?? fallback.hmcChurchId ?? null);
    setName(data.church?.churchName ?? fallback.name);
    setCity(data.church?.churchCity ?? fallback.city);
    setState(data.church?.churchState ?? fallback.state);
    setCountry(data.church?.churchCountry ?? fallback.country);
    setEntryMode('directory');
  };

  const handlePick = (pick: HmcChurchPick) => {
    // Show the pick immediately — search already returned denorm fields; save
    // still validates via HMC + DB in the background.
    setHmcChurchId(pick.id);
    setName(pick.name);
    setCity(pick.city);
    setState(pick.state);
    setCountry('');
    setEntryMode('directory');
    updateChurch.mutate(
      { hmcChurchId: pick.id },
      {
        onSuccess: (data) => {
          applyChurchFromResponse(data, {
            hmcChurchId: pick.id,
            name: pick.name,
            city: pick.city,
            state: pick.state,
            country: '',
          });
        },
        onError: () => {
          setHmcChurchId(null);
          setName('');
          setCity('');
          setState('');
          setCountry('');
          setEntryMode('directory');
        },
      },
    );
  };

  const handleClear = () => {
    updateChurch.mutate(
      { hmcChurchId: null },
      {
        onSuccess: () => {
          setHmcChurchId(null);
          setName('');
          setCity('');
          setState('');
          setCountry('');
          setEntryMode('directory');
        },
      },
    );
  };

  const handleOutsideUsSave = (event: FormEvent) => {
    event.preventDefault();
    const churchName = draftName.trim();
    const churchCountry = draftCountry.trim();
    if (!churchName || !churchCountry) return;
    if (isUnitedStatesCountryLabel(churchCountry)) return;
    const churchCity = draftCity.trim() || null;
    const churchState = draftRegion.trim() || null;
    updateChurch.mutate(
      {
        intent: 'outside_us',
        churchName,
        churchCity,
        churchState,
        churchCountry,
      },
      {
        onSuccess: (data) => {
          applyChurchFromResponse(data, {
            hmcChurchId: null,
            name: churchName,
            city: churchCity ?? '',
            state: churchState ?? '',
            country: churchCountry,
          });
        },
      },
    );
  };

  const handleUnlistedUsSave = (event: FormEvent) => {
    event.preventDefault();
    const churchName = draftName.trim();
    const churchCity = draftCity.trim();
    const churchState = draftRegion.trim();
    if (!churchName || !churchCity || !churchState) return;
    updateChurch.mutate(
      {
        intent: 'unlisted_us',
        churchName,
        churchCity,
        churchState,
        churchCountry: null,
      },
      {
        onSuccess: (data) => {
          applyChurchFromResponse(data, {
            hmcChurchId: null,
            name: churchName,
            city: churchCity,
            state: churchState,
            country: '',
          });
        },
      },
    );
  };

  const introCopy =
    entryMode === 'outside_us' && !hasChurch
      ? 'Saved to your Harvous profile only.'
      : entryMode === 'unlisted_us' && !hasChurch
        ? 'We’ll suggest this church to Here’s My Church and save it to your profile.'
        : 'Pick your church from our directory (U.S. for now). Can’t find it? Use the links below.';

  const outsideCountryLooksUs =
    Boolean(draftCountry.trim()) && isUnitedStatesCountryLabel(draftCountry);

  return (
    <SettingsShell fillHeight>
      <SectionLabel>My church</SectionLabel>
      {!hasChurch ? (
        <p className="proto-caption" style={{ margin: '0 0 12px', color: 'var(--pds-text-secondary)' }}>
          {introCopy}
        </p>
      ) : null}

      {hasChurch ? (
        <>
          <SettingsGroup>
            <SettingsRow
              label={name || 'Church'}
              sublabel={
                [location, hmcChurchId ? 'Directory' : null].filter(Boolean).join(' · ') || undefined
              }
              leadingIcon="church"
              trailing="none"
              disabled
            />
          </SettingsGroup>
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary"
            disabled={updateChurch.isPending}
            onClick={handleClear}
          >
            Clear church
          </button>
        </>
      ) : entryMode === 'outside_us' ? (
        <form onSubmit={handleOutsideUsSave}>
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">Church name</span>
            <input
              className="proto-settings-field__input proto-create-folder-sheet__name-input"
              type="text"
              value={draftName}
              disabled={updateChurch.isPending}
              onChange={(e) => setDraftName(e.target.value)}
              autoComplete="organization"
              required
            />
          </label>
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">Country</span>
            <input
              className="proto-settings-field__input proto-create-folder-sheet__name-input"
              type="text"
              value={draftCountry}
              disabled={updateChurch.isPending}
              onChange={(e) => setDraftCountry(e.target.value)}
              autoComplete="country-name"
              required
            />
          </label>
          {outsideCountryLooksUs ? (
            <p className="proto-caption" style={{ margin: '0 0 12px', color: 'var(--pds-destructive, #b42318)' }}>
              For U.S. churches, go back and use the directory or “Not in the directory (U.S.).”
            </p>
          ) : null}
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">City</span>
            <input
              className="proto-settings-field__input proto-create-folder-sheet__name-input"
              type="text"
              value={draftCity}
              disabled={updateChurch.isPending}
              onChange={(e) => setDraftCity(e.target.value)}
              autoComplete="address-level2"
            />
          </label>
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">State / region</span>
            <input
              className="proto-settings-field__input proto-create-folder-sheet__name-input"
              type="text"
              value={draftRegion}
              disabled={updateChurch.isPending}
              onChange={(e) => setDraftRegion(e.target.value)}
              autoComplete="address-level1"
            />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="submit"
              className="proto-settings-btn"
              disabled={
                updateChurch.isPending ||
                !draftName.trim() ||
                !draftCountry.trim() ||
                outsideCountryLooksUs
              }
            >
              Save church
            </button>
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              disabled={updateChurch.isPending}
              onClick={() => setEntryMode('directory')}
            >
              Back to U.S. directory
            </button>
          </div>
        </form>
      ) : entryMode === 'unlisted_us' ? (
        <form onSubmit={handleUnlistedUsSave}>
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">Church name</span>
            <input
              className="proto-settings-field__input proto-create-folder-sheet__name-input"
              type="text"
              value={draftName}
              disabled={updateChurch.isPending}
              onChange={(e) => setDraftName(e.target.value)}
              autoComplete="organization"
              required
            />
          </label>
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">State</span>
            <div className="hmc-church-picker__select-wrap">
              <select
                className="proto-settings-field__input proto-create-folder-sheet__name-input hmc-church-picker__select"
                value={draftRegion}
                disabled={updateChurch.isPending}
                onChange={(e) => setDraftRegion(e.target.value)}
                required
              >
                <option value="">Select state…</option>
                {US_STATE_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.code} — {opt.label}
                  </option>
                ))}
              </select>
              <span className="hmc-church-picker__select-chevron" aria-hidden>
                <Icon name="chevron-down" size={11} />
              </span>
            </div>
          </label>
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">City</span>
            <input
              className="proto-settings-field__input proto-create-folder-sheet__name-input"
              type="text"
              value={draftCity}
              disabled={updateChurch.isPending}
              onChange={(e) => setDraftCity(e.target.value)}
              autoComplete="address-level2"
              required
            />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="submit"
              className="proto-settings-btn"
              disabled={
                updateChurch.isPending ||
                !draftName.trim() ||
                !draftRegion ||
                !draftCity.trim()
              }
            >
              Submit and save
            </button>
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              disabled={updateChurch.isPending}
              onClick={() => setEntryMode('directory')}
            >
              Back to U.S. directory
            </button>
          </div>
        </form>
      ) : (
        <HmcChurchPicker
          variant="settings"
          onSearch={searchHmc}
          onPick={handlePick}
          onRequestOutsideUs={() => openDraft('outside_us')}
          onRequestUnlistedUs={() => openDraft('unlisted_us')}
          disabled={updateChurch.isPending}
        />
      )}

      <ErrorText>{updateChurch.isError ? "Couldn't save. Please try again." : null}</ErrorText>

      {ledSharedSpaces.length > 0 ? (
        <div style={{ marginTop: 28 }}>
          <SectionLabel>Shared spaces you help lead</SectionLabel>
          <SettingsGroup>
            {ledSharedSpaces.map((space) => (
              <SettingsRow
                key={space.id}
                label={space.title}
                sublabel={spaceChurchSublabel(space)}
                leadingIcon="user-group"
                leadingAccent="var(--pds-highlight-sky-blue)"
                trailing="none"
                disabled
              />
            ))}
          </SettingsGroup>
        </div>
      ) : null}

      <aside
        aria-label="About Here’s My Church"
        style={{
          // Stick to bottom when space allows, but keep a real gap above the card
          // when the form fills the column (margin-top: auto alone collapses to 0).
          marginTop: 'auto',
          paddingTop: 28,
        }}
      >
        <div
          style={{
            padding: 14,
            border: '0.5px solid var(--pds-border)',
            borderRadius: 'var(--pds-radius-menu)',
            background: 'var(--pds-bg-subtle)',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <img
            src="/images/heresmychurch-app-icon.png"
            alt=""
            width={40}
            height={40}
            style={{ borderRadius: 10, flexShrink: 0 }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              className="pds-list-title"
              style={{ margin: '0 0 4px', fontSize: '0.9375rem', fontWeight: 700 }}
            >
              Here’s My Church
            </p>
            <p
              className="proto-caption"
              style={{ margin: '0 0 10px', color: 'var(--pds-text-secondary)', lineHeight: 1.45 }}
            >
              Our open-source map of Christian churches across the U.S. — free to use, no account
              required.
            </p>
            <a
              href="https://heresmychurch.com"
              target="_blank"
              rel="noopener noreferrer"
              className="proto-settings-btn proto-settings-btn--secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
                width: 'auto',
                padding: '8px 12px',
                fontSize: '0.8125rem',
              }}
            >
              Visit heresmychurch.com
              <Icon name="arrow-up-right-from-square" size={12} aria-hidden />
            </a>
          </div>
        </div>
      </aside>
    </SettingsShell>
  );
}
