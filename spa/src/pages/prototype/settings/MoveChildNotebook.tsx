/**
 * Moving a child notebook into the young person's own Harvous account, once they're 13.
 *
 * The parent makes a single-use link here; the teen claims it at `/family/notebook/:token`
 * (PublicClaimNotebookPage). The server moves the notebook in one transaction and deletes the
 * child record (server/family/notebook-move.ts). This page says exactly what moves and what
 * doesn't before the link exists, and asks the parent to confirm the age.
 */
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useCreateFamilyInvite, useFamily } from '../../../hooks/queries/useFamily';
import type { ChildDetail } from '../../family/types';
import ProtoLoadingDots from '../ProtoLoadingDots';
import { SettingsCopyRow, SettingsGroup, SettingsIntro, SettingsRow } from './SettingsShell';

type Props = {
  detail: ChildDetail;
  busy: boolean;
  perform: (work: () => Promise<unknown>, message: string) => Promise<void>;
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

export default function MoveChildNotebook({ detail, busy, perform }: Props) {
  const { child } = detail;
  const endpoint = `/api/child-accounts/children/${encodeURIComponent(child.id)}/move`;
  const family = useFamily().data;
  const createInvite = useCreateFamilyInvite();
  const [olderConfirmed, setOlderConfirmed] = useState(false);
  const [alsoInvite, setAlsoInvite] = useState(true);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const name = child.displayName;
  const open = detail.move ?? null;
  const active = child.status === 'active';

  // Offered when the parent can invite and there's a place: the teen joins as "Child, 13 or older".
  const inFamily = family && family.family ? family : null;
  const canInvite = !!inFamily && inFamily.me.role === 'parent' && inFamily.family.sponsoring && !inFamily.family.frozen
    && inFamily.family.members.length + inFamily.family.invites.length < inFamily.maxMembers;

  function makeLink() {
    void perform(async () => {
      const familyInviteId = canInvite && alsoInvite
        ? (await createInvite.mutateAsync({ role: 'child', label: `For ${name}` })).invite.id
        : null;
      setLink(await api.post<{ url: string; expiresAt: string }>(endpoint, { familyInviteId }));
    }, '');
  }

  return (
    <>
      <SettingsIntro>
        When {name} turns 13, they can have their own Harvous account and keep what they wrote. They claim it
        with a link from you, signed in to their own account.
      </SettingsIntro>

      <h3 className="pds-caption pds-family-enrollment-label">What moves</h3>
      <SettingsGroup>
        <SettingsRow leadingIcon="note-sticky" trailing="none" label="Notes, folders, tags and Threads"
          sublabel="Into their My Home, with the verses each note mentions" />
        <SettingsRow leadingIcon="highlighter" trailing="none" label="Highlights and Look back"
          sublabel="As highlights in their Bible, and their Review history" />
        <SettingsRow leadingIcon="book-open" trailing="none" label="Their Family Bible thoughts"
          sublabel="As notes in a Family Bible folder. Your replies to them aren’t included." />
        <SettingsRow leadingIcon="download" trailing="none" label="Stickers and the notebook cover don’t move"
          sublabel="They’re only in child notebooks. Download the backup first to keep them." />
      </SettingsGroup>

      <h3 className="pds-caption pds-family-enrollment-label">Once they claim it</h3>
      <SettingsGroup>
        <SettingsRow leadingIcon="lock" trailing="none" label="It leaves My Family"
          sublabel="You can’t open it any more, child sign-ins stop, and the child notebook is deleted." />
        {canInvite ? (
          <SettingsRow leadingIcon="people-roof" trailing="none" label={`They can join ${inFamily!.family.name}`}
            sublabel="As a child, 13 or older: you see how their study is going, never what they write." />
        ) : null}
      </SettingsGroup>

      {link ? (
        <div className="pds-family-management__inline">
          <SettingsCopyRow value="Notebook move link" copyValue={link.url} layout="field" copyLabel="Copy link" />
          <p className="pds-caption pds-family-management__link-help" role="status">
            Send it to {name}. It works once, until {shortDate(link.expiresAt)}. They open it signed in to their own
            account, or create one.
          </p>
        </div>
      ) : open ? (
        <SettingsGroup>
          <SettingsRow leadingIcon="link" trailing="none" label="A move link is open"
            sublabel={`Works until ${shortDate(open.expiresAt)}. Make a new one if you need to send it again.`} />
        </SettingsGroup>
      ) : null}

      {active ? (
        <section className="pds-family-management__inline" aria-label="Make a move link">
          <label className="pds-family-choice pds-subheadline">
            <input type="checkbox" className="proto-checkbox--accent" checked={olderConfirmed} disabled={busy}
              onChange={(event) => setOlderConfirmed(event.target.checked)} />
            <span>{name} is 13 or older and will use their own Harvous account.</span>
          </label>
          {canInvite ? (
            <label className="pds-family-choice pds-subheadline">
              <input type="checkbox" className="proto-checkbox--accent" checked={alsoInvite} disabled={busy}
                onChange={(event) => setAlsoInvite(event.target.checked)} />
              <span>Invite them to {inFamily!.family.name} too</span>
            </label>
          ) : null}
          <div className="pds-family-verification__actions">
            <button type="button" className="proto-settings-btn proto-ink-on-accent" disabled={busy || !olderConfirmed} onClick={makeLink}>
              {busy ? <ProtoLoadingDots /> : null} {open || link ? 'Make a new link' : 'Make move link'}
            </button>
            {open || link ? (
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary" disabled={busy}
                onClick={() => void perform(async () => { await api.delete(endpoint); setLink(null); }, 'Move link turned off.')}>
                Turn off link
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <SettingsIntro>Consent was withdrawn, so this notebook can’t be moved. You can still download it.</SettingsIntro>
      )}
    </>
  );
}
