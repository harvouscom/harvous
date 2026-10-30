/**
 * "Bring {church} to Harvous" — a staff member asking for their church, from Settings › My Church.
 *
 * Shown under a church the person picked that is not on Harvous yet. It starts from that pick —
 * the Here's My Church listing carries the church's name, place and service times — so the form
 * asks only what the directory can't know: who they are, and how to reach them.
 *
 * Concierge, on purpose: submitting asks; a Harvous admin approves, which creates the church's
 * staff organization with this person as its admin and starts a 30-day pilot. Until then nothing
 * changes for anyone.
 */
import { useState, type FormEvent } from 'react';
import { useUser } from '@clerk/clerk-react';
import { APIError } from '../../../lib/api';
import { useChurchApplicationActions, useMyChurchApplication } from '../../../hooks/queries/useChurchApplication';
import { SettingsGroup, SettingsRow } from './SettingsShell';
import { ErrorText } from './account/accountShared';

function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export default function PrototypeChurchApplication({
  church,
  startOpen = false,
}: {
  /** The church the person picked. `hmcChurchId` null = typed by hand (not in the directory). */
  church: { hmcChurchId: string | null; name: string; city: string | null; state: string | null; country: string | null };
  /** Arrived from "Bring your church to Harvous" (/churches/start): open the form straight away. */
  startOpen?: boolean;
}) {
  const { user } = useUser();
  const { data } = useMyChurchApplication();
  const { submit, withdraw } = useChurchApplicationActions();
  const [open, setOpen] = useState(startOpen);
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const application = data?.application ?? null;
  const sameChurch =
    application && (application.hmcChurchId ? application.hmcChurchId === church.hmcChurchId : application.name === church.name);

  if (application?.status === 'pending' && sameChurch) {
    return (
      <>
        <p className="proto-caption" style={{ margin: '4px 0 8px', color: 'var(--pds-text-secondary)' }}>
          {`You asked to bring ${application.name} to Harvous. We’ll be in touch to set it up with you.`}
        </p>
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary"
          disabled={withdraw.isPending}
          onClick={() => withdraw.mutate(application.id)}
        >
          Withdraw request
        </button>
      </>
    );
  }

  if (application?.status === 'approved' && data?.church) {
    return (
      <p className="proto-caption" style={{ margin: '4px 0 12px', color: 'var(--pds-text-secondary)' }}>
        {`${data.church.name} is on Harvous, and you’re its admin. Open My Church from the sidebar to set it up.`}
      </p>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const contactEmail = email.trim() || user?.primaryEmailAddress?.emailAddress || null;
    try {
      await submit.mutateAsync({
        hmcChurchId: church.hmcChurchId,
        name: church.hmcChurchId ? null : church.name,
        city: church.city,
        state: church.state,
        country: church.country,
        applicantRole: role.trim(),
        contactEmail,
        timezone: browserTimezone(),
        notes: notes.trim() || null,
      });
      setOpen(false);
    } catch (e) {
      setError(e instanceof APIError ? e.message : 'Could not send your request. Try again.');
    }
  };

  if (!open) {
    return (
      <>
        {application?.status === 'declined' && sameChurch ? (
          <p className="proto-caption" style={{ margin: '4px 0 8px', color: 'var(--pds-text-secondary)' }}>
            {application.decisionNote
              ? `Your last request wasn’t approved: ${application.decisionNote}`
              : 'Your last request wasn’t approved. You can ask again.'}
          </p>
        ) : null}
        <SettingsGroup>
          <SettingsRow
            label={`Bring ${church.name} to Harvous`}
            sublabel="For pastors and staff · channels, study plans and Review for your congregation"
            leadingIcon="church"
            onClick={() => setOpen(true)}
          />
        </SettingsGroup>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ marginBottom: 12 }}>
      <p className="proto-caption" style={{ margin: '4px 0 8px', color: 'var(--pds-text-secondary)' }}>
        {`Tell us who you are at ${church.name}. We set churches up personally, then you invite your team.`}
      </p>
      <label className="proto-settings-field">
        <span className="proto-settings-field__label">Your role at the church</span>
        <input
          className="proto-settings-field__input proto-create-folder-sheet__name-input"
          type="text"
          value={role}
          placeholder="Senior pastor, discipleship director…"
          disabled={submit.isPending}
          onChange={(e) => setRole(e.target.value)}
          required
        />
      </label>
      <label className="proto-settings-field">
        <span className="proto-settings-field__label">Best email to reach you</span>
        <input
          className="proto-settings-field__input proto-create-folder-sheet__name-input"
          type="email"
          value={email}
          placeholder={user?.primaryEmailAddress?.emailAddress ?? ''}
          disabled={submit.isPending}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>
      <label className="proto-settings-field">
        <span className="proto-settings-field__label">Anything we should know (optional)</span>
        <textarea
          className="proto-settings-field__input proto-create-folder-sheet__name-input"
          value={notes}
          rows={3}
          disabled={submit.isPending}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="proto-settings-btn" disabled={submit.isPending || !role.trim()}>
          {submit.isPending ? 'Sending…' : 'Send request'}
        </button>
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary"
          disabled={submit.isPending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
