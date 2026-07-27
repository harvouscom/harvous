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
import {
  HMC_COUNTRIES,
  getHmcCountry,
  isHmcDirectoryCountry,
  matchesHmcDirectoryCountry,
} from '@/utils/hmc-directory';
import { resolveDefaultHmcCountry } from '@/utils/hmc-default-country';

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

async function searchUserHmcChurches(q: string, region: string): Promise<HmcChurchPick[]> {
  const params = new URLSearchParams({ q, state: region, limit: '20' });
  const data = await api.get<{ success: boolean; results: HmcChurchPick[] }>(
    `/api/user/churches/hmc/search?${params.toString()}`,
  );
  return data.results ?? [];
}

type EntryMode = 'directory' | 'outside_directory' | 'unlisted';

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
  const [draftAddress, setDraftAddress] = useState('');
  const [draftCountry, setDraftCountry] = useState(() => resolveDefaultHmcCountry());

  const ledSharedSpaces = useMemo(() => staffedChurchSharedSpaces(nav), [nav]);

  useEffect(() => {
    if (!profile || updateChurch.isPending) return;
    const nextHmc = profile.hmcChurchId ?? null;
    const nextName = profile.churchName ?? '';
    const nextCity = profile.churchCity ?? '';
    const nextState = profile.churchState ?? '';
    const nextCountry = profile.churchCountry ?? '';

    if (!hydrated) {
      setHmcChurchId(nextHmc);
      setName(nextName);
      setCity(nextCity);
      setState(nextState);
      setCountry(nextCountry);
      setHydrated(true);
      return;
    }

    // First paint can hydrate from a stale empty profile cache; adopt church when
    // the refetch (or mutation patch) arrives with data and local form is still empty.
    const localEmpty = !hmcChurchId && !name;
    const profileHasChurch = Boolean(nextHmc || nextName);
    if (localEmpty && profileHasChurch) {
      setHmcChurchId(nextHmc);
      setName(nextName);
      setCity(nextCity);
      setState(nextState);
      setCountry(nextCountry);
    }
  }, [
    profile,
    hydrated,
    hmcChurchId,
    name,
    updateChurch.isPending,
  ]);

  const searchHmc = useCallback((q: string, region: string) => searchUserHmcChurches(q, region), []);

  const location = formatChurchLocation({
    churchCity: city,
    churchState: state,
    churchCountry: country,
  });

  const hasChurch = Boolean(hmcChurchId || name);

  const unlistedRegionNoun = getHmcCountry(draftCountry)?.regionNoun.one ?? 'region';
  const unlistedAddressPlaceholder = `Street, city, ${unlistedRegionNoun}`;

  const openUnlisted = (countryCode: string) => {
    setDraftName('');
    setDraftAddress('');
    setDraftCountry(
      isHmcDirectoryCountry(countryCode)
        ? countryCode.toUpperCase()
        : resolveDefaultHmcCountry(),
    );
    setEntryMode('unlisted');
  };

  const openOutsideDirectory = () => {
    setDraftName('');
    setDraftCity('');
    setDraftRegion('');
    setDraftAddress('');
    setDraftCountry('');
    setEntryMode('outside_directory');
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
    const pickCountry = (pick.country ?? '').trim().toUpperCase();
    setHmcChurchId(pick.id);
    setName(pick.name);
    setCity(pick.city);
    setState(pick.state);
    setCountry(pickCountry);
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
            country: pickCountry,
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

  const handleOutsideDirectorySave = (event: FormEvent) => {
    event.preventDefault();
    const churchName = draftName.trim();
    const churchCountry = draftCountry.trim();
    if (!churchName || !churchCountry) return;
    if (matchesHmcDirectoryCountry(churchCountry)) return;
    const churchCity = draftCity.trim() || null;
    const churchState = draftRegion.trim() || null;
    updateChurch.mutate(
      {
        intent: 'outside_directory',
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

  const handleUnlistedSave = (event: FormEvent) => {
    event.preventDefault();
    const churchName = draftName.trim();
    const churchAddress = draftAddress.trim();
    const churchCountry = draftCountry.trim().toUpperCase();
    if (!churchName || !churchAddress || !isHmcDirectoryCountry(churchCountry)) return;
    updateChurch.mutate(
      {
        intent: 'unlisted',
        churchName,
        churchAddress,
        churchCountry,
      },
      {
        onSuccess: (data) => {
          applyChurchFromResponse(data, {
            hmcChurchId: null,
            name: churchName,
            city: churchAddress,
            state: '',
            country: churchCountry,
          });
        },
      },
    );
  };

  const introCopy =
    entryMode === 'outside_directory' && !hasChurch
      ? 'Saved to your Harvous profile only — this country isn’t in the directory yet.'
      : entryMode === 'unlisted' && !hasChurch
        ? `Add the name and full address (city and ${unlistedRegionNoun} included). We’ll suggest it to Here’s My Church and save it to your profile.`
        : 'Pick your church from the Here’s My Church directory. Can’t find it? Use the links below.';

  const outsideLooksLikeDirectoryCountry =
    Boolean(draftCountry.trim()) && matchesHmcDirectoryCountry(draftCountry);

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
      ) : entryMode === 'outside_directory' ? (
        <form onSubmit={handleOutsideDirectorySave}>
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
          {outsideLooksLikeDirectoryCountry ? (
            <p
              className="proto-caption"
              style={{ margin: '0 0 12px', color: 'var(--pds-destructive, #b42318)' }}
            >
              {getHmcCountry(draftCountry)?.name ?? draftCountry} is in the directory — go back and
              search, or use “Not in the directory.”
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
                outsideLooksLikeDirectoryCountry
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
              Back to directory
            </button>
          </div>
        </form>
      ) : entryMode === 'unlisted' ? (
        <form onSubmit={handleUnlistedSave}>
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">Country</span>
            <div className="hmc-church-picker__select-wrap">
              <select
                className="proto-settings-field__input proto-create-folder-sheet__name-input hmc-church-picker__select"
                value={draftCountry}
                disabled={updateChurch.isPending}
                onChange={(e) => setDraftCountry(e.target.value)}
                required
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
            <span className="proto-settings-field__label">Address</span>
            <input
              className="proto-settings-field__input proto-create-folder-sheet__name-input"
              type="text"
              value={draftAddress}
              disabled={updateChurch.isPending}
              onChange={(e) => setDraftAddress(e.target.value)}
              autoComplete="street-address"
              placeholder={unlistedAddressPlaceholder}
              required
            />
          </label>
          <p className="proto-caption" style={{ margin: '0 0 12px', color: 'var(--pds-text-tertiary)' }}>
            Include city and {unlistedRegionNoun} so we can place it on the map.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="submit"
              className="proto-settings-btn"
              disabled={
                updateChurch.isPending || !draftName.trim() || !draftAddress.trim()
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
              Back to directory
            </button>
          </div>
        </form>
      ) : (
        <HmcChurchPicker
          variant="settings"
          onSearch={searchHmc}
          onPick={handlePick}
          onRequestOutsideDirectory={openOutsideDirectory}
          onRequestUnlisted={openUnlisted}
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
              Our open-source map of Christian churches around the world — free to use, no account
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
