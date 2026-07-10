import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeSettingsRouteTo } from '@/lib/prototype-path';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useUpdateChurch } from '../../../hooks/mutations/useUpdateChurch';
import { SettingsIntro, SettingsShell } from './SettingsShell';
import { ErrorText, Field } from './account/accountShared';

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
    <SettingsShell>
      <SettingsIntro>Optional details about your church. These sync across your devices.</SettingsIntro>

      <Field label="Church name" value={name} placeholder="e.g. Grace Community Church" onChange={setName} />
      <Field label="City" value={city} placeholder="City" onChange={setCity} />
      <Field label="State / region" value={state} placeholder="State or region" onChange={setState} />
      <Field label="Country" value={country} placeholder="Country" onChange={setCountry} />

      <ErrorText>{updateChurch.isError ? "Couldn't save. Please try again." : null}</ErrorText>

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
