import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeSettingsRouteTo } from '@/lib/prototype-path';
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
  US_STATE_OPTIONS,
  isUnitedStatesCountryLabel,
  isUsChurchLocation,
} from '@/utils/us-states';

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

type EntryMode = 'directory' | 'manual';

export default function PrototypeChurchPage() {
  const navigate = useNavigate();
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

  const openManual = () => {
    setDraftName('');
    setDraftCity('');
    setDraftRegion('');
    setDraftCountry('');
    setEntryMode('manual');
  };

  const handlePick = (pick: HmcChurchPick) => {
    updateChurch.mutate(
      { hmcChurchId: pick.id },
      {
        onSuccess: (data) => {
          setHmcChurchId(data.church?.hmcChurchId ?? pick.id);
          setName(data.church?.churchName ?? pick.name);
          setCity(data.church?.churchCity ?? pick.city);
          setState(data.church?.churchState ?? pick.state);
          setCountry(data.church?.churchCountry ?? '');
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

  const manualIsUs =
    !draftCountry.trim() || isUnitedStatesCountryLabel(draftCountry);

  const handleManualSave = (event: FormEvent) => {
    event.preventDefault();
    const churchName = draftName.trim();
    if (!churchName) return;
    const churchCity = draftCity.trim() || null;
    const churchState = draftRegion.trim() || null;
    const churchCountry = draftCountry.trim() || null;
    if (isUsChurchLocation({ churchState, churchCountry }) && !churchCity) return;
    updateChurch.mutate(
      {
        churchName,
        churchCity,
        churchState,
        churchCountry,
      },
      {
        onSuccess: (data) => {
          setHmcChurchId(data.church?.hmcChurchId ?? null);
          setName(data.church?.churchName ?? churchName);
          setCity(data.church?.churchCity ?? churchCity ?? '');
          setState(data.church?.churchState ?? churchState ?? '');
          setCountry(data.church?.churchCountry ?? churchCountry ?? '');
          setEntryMode('directory');
        },
      },
    );
  };

  return (
    <SettingsShell fillHeight>
      <SectionLabel>My church</SectionLabel>
      <p className="proto-caption" style={{ margin: '0 0 12px', color: 'var(--pds-text-secondary)' }}>
        {entryMode === 'manual' && !hasChurch
          ? 'Enter your church if it’s outside the U.S. or not in our directory yet.'
          : 'Pick your church from our directory (U.S. for now). Outside the U.S., or not listed? Enter it manually.'}
      </p>

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              disabled={updateChurch.isPending}
              onClick={handleClear}
            >
              Clear church
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: prototypeSettingsRouteTo() })}
              className="proto-settings-btn"
            >
              Done
            </button>
          </div>
        </>
      ) : entryMode === 'manual' ? (
        <form onSubmit={handleManualSave}>
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
              onChange={(e) => {
                setDraftCountry(e.target.value);
                // Leaving the U.S. clears a US state code so we don't mis-route to HMC.
                if (e.target.value.trim() && !isUnitedStatesCountryLabel(e.target.value)) {
                  setDraftRegion('');
                }
              }}
              autoComplete="country-name"
              placeholder="Leave blank for United States"
            />
          </label>
          {manualIsUs ? (
            <label className="proto-settings-field">
              <span className="proto-settings-field__label">State</span>
              <select
                className="proto-settings-field__input proto-create-folder-sheet__name-input"
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
            </label>
          ) : (
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
          )}
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">City</span>
            <input
              className="proto-settings-field__input proto-create-folder-sheet__name-input"
              type="text"
              value={draftCity}
              disabled={updateChurch.isPending}
              onChange={(e) => setDraftCity(e.target.value)}
              autoComplete="address-level2"
              required={manualIsUs}
            />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="submit"
              className="proto-settings-btn"
              disabled={
                updateChurch.isPending ||
                !draftName.trim() ||
                (manualIsUs && (!draftRegion || !draftCity.trim()))
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
      ) : (
        <HmcChurchPicker
          variant="settings"
          onSearch={searchHmc}
          onPick={handlePick}
          onRequestManual={openManual}
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
          <p className="proto-caption" style={{ margin: '0 0 10px', color: 'var(--pds-text-secondary)', lineHeight: 1.45 }}>
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
      </aside>
    </SettingsShell>
  );
}
