import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeSettingsRouteTo } from '@/lib/prototype-path';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useUpdateChurch } from '../../../hooks/mutations/useUpdateChurch';
import { SettingsShell } from './SettingsShell';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--pds-text-secondary)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 14px',
  border: '0.5px solid var(--pds-border)',
  borderRadius: 'var(--pds-radius-input)',
  background: 'var(--pds-bg-input)',
  fontFamily: 'var(--pds-font-body)',
  fontSize: '0.9375rem',
  color: 'var(--pds-text-primary)',
  outline: 'none',
};

function Field(props: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{props.label}</label>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

export default function PrototypeChurchPage() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const updateChurch = useUpdateChurch();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !profile) return;
    setName(profile.churchName ?? '');
    setCity(profile.churchCity ?? '');
    setState(profile.churchState ?? '');
    setCountry(profile.churchCountry ?? '');
    setHydrated(true);
  }, [profile, hydrated]);

  const handleSave = () => {
    updateChurch.mutate(
      { churchName: name, churchCity: city, churchState: state, churchCountry: country },
      { onSuccess: () => navigate({ to: prototypeSettingsRouteTo() }) },
    );
  };

  return (
    <SettingsShell title="My Church">
      <p className="pds-subheadline" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 20px' }}>
        Optional details about your church. These sync across your devices.
      </p>

      <Field label="Church name" value={name} placeholder="e.g. Grace Community Church" onChange={setName} />
      <Field label="City" value={city} placeholder="City" onChange={setCity} />
      <Field label="State / region" value={state} placeholder="State or region" onChange={setState} />
      <Field label="Country" value={country} placeholder="Country" onChange={setCountry} />

      {updateChurch.isError ? (
        <p style={{ color: 'var(--pds-destructive)', fontSize: '0.8125rem', margin: '4px 0 12px' }}>
          Couldn't save. Please try again.
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSave}
        disabled={updateChurch.isPending}
        className="proto-settings-btn"
        style={{ marginTop: 8 }}
      >
        {updateChurch.isPending ? 'Saving…' : 'Save'}
      </button>
    </SettingsShell>
  );
}
