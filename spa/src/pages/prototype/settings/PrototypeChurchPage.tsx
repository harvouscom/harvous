import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeSettingsRouteTo } from '@/lib/prototype-path';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useNavigation } from '../../../hooks/queries/useNavigation';
import { useUpdateChurch } from '../../../hooks/mutations/useUpdateChurch';
import {
  staffChurchChannelSummary,
  staffChurchesFromNavSpaces,
  formatChurchLocation,
} from '../../../lib/church-settings';
import { SettingsGroup, SettingsRow, SettingsShell } from './SettingsShell';
import { ErrorText } from './account/accountShared';
import HmcChurchPicker, { type HmcChurchPick } from '@/components/react/HmcChurchPicker';
import { api } from '../../../lib/api';

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="proto-caption" style={{ margin: '0 0 8px', color: 'var(--pds-text-tertiary)' }}>
      {children}
    </p>
  );
}

async function searchUserHmcChurches(q: string, state: string): Promise<HmcChurchPick[]> {
  const params = new URLSearchParams({ q, state, limit: '20' });
  const data = await api.get<{ success: boolean; results: HmcChurchPick[] }>(
    `/api/user/churches/hmc/search?${params.toString()}`,
  );
  return data.results ?? [];
}

export default function PrototypeChurchPage() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: nav } = useNavigation();
  const updateChurch = useUpdateChurch();

  const [hydrated, setHydrated] = useState(false);
  const [hmcChurchId, setHmcChurchId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  const staffChurches = useMemo(
    () => staffChurchesFromNavSpaces([...(nav?.spaces ?? []), ...(nav?.memberOfSpaces ?? [])]),
    [nav?.spaces, nav?.memberOfSpaces],
  );

  useEffect(() => {
    if (hydrated || !profile) return;
    setHmcChurchId(profile.hmcChurchId ?? null);
    setName(profile.churchName ?? '');
    setCity(profile.churchCity ?? '');
    setState(profile.churchState ?? '');
    setHydrated(true);
  }, [profile, hydrated]);

  const searchHmc = useCallback((q: string, st: string) => searchUserHmcChurches(q, st), []);

  const location = formatChurchLocation({ churchCity: city, churchState: state });

  const handlePick = (pick: HmcChurchPick) => {
    updateChurch.mutate(
      { hmcChurchId: pick.id },
      {
        onSuccess: (data) => {
          setHmcChurchId(data.church?.hmcChurchId ?? pick.id);
          setName(data.church?.churchName ?? pick.name);
          setCity(data.church?.churchCity ?? pick.city);
          setState(data.church?.churchState ?? pick.state);
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
        },
      },
    );
  };

  return (
    <SettingsShell>
      {staffChurches.length > 0 ? (
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Churches you help lead</SectionLabel>
          <SettingsGroup>
            {staffChurches.map((church) => (
              <SettingsRow
                key={church.orgId}
                label={church.churchName}
                sublabel={
                  formatChurchLocation(church)
                    ? `${formatChurchLocation(church)} · ${staffChurchChannelSummary(church)}`
                    : staffChurchChannelSummary(church)
                }
                leadingIcon="church"
                leadingAccent="var(--pds-highlight-sky-blue)"
                trailing="none"
                disabled
              />
            ))}
          </SettingsGroup>
        </div>
      ) : null}

      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Home church</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            label="Not connected"
            sublabel="Connect is coming soon"
            badge="Soon"
            trailing="none"
            disabled
          />
        </SettingsGroup>
      </div>

      <SectionLabel>My church</SectionLabel>
      <p className="proto-caption" style={{ margin: '0 0 12px', color: 'var(--pds-text-secondary)' }}>
        Pick your church from Here’s My Church. This does not connect you to a Harvous church org yet.
      </p>

      {hmcChurchId || name ? (
        <div style={{ marginBottom: 16 }}>
          <SettingsGroup>
            <SettingsRow
              label={name || 'Church'}
              sublabel={[location, hmcChurchId].filter(Boolean).join(' · ') || undefined}
              leadingIcon="church"
              trailing="none"
              disabled
            />
          </SettingsGroup>
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary"
            style={{ marginTop: 10 }}
            disabled={updateChurch.isPending}
            onClick={handleClear}
          >
            Clear church
          </button>
        </div>
      ) : (
        <HmcChurchPicker
          variant="settings"
          onSearch={searchHmc}
          onPick={handlePick}
          disabled={updateChurch.isPending}
        />
      )}

      <ErrorText>{updateChurch.isError ? "Couldn't save. Please try again." : null}</ErrorText>

      {hmcChurchId || name ? (
        <button
          type="button"
          onClick={() => navigate({ to: prototypeSettingsRouteTo() })}
          className="proto-settings-btn"
          style={{ marginTop: 8 }}
        >
          Done
        </button>
      ) : null}
    </SettingsShell>
  );
}
