import { clearUserClientStorageCaches } from '@/utils/clear-user-client-caches';
import { deletePersistedQueryCache } from '@/utils/query-cache-persistence';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { api } from '../../../lib/api';
import { useAuthReady } from '../../../hooks/useAuthReady';
import { SettingsShell, SettingsIntro } from './SettingsShell';
import ProtoConfirmDialog from '../ProtoConfirmDialog';
import ChildPrivacyNotice from '../../family/ChildPrivacyNotice';
import { downloadChildNotebook, type ChildExportFormat } from '../../family/download-child-notebook';
import type { ChildDetail, FamilyStatus } from '../../family/types';
import '../../../styles/family.css';

export default function PrototypeFamilyPage() {
  const ready = useAuthReady();
  const clerk = useClerk();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmChildMode, setConfirmChildMode] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [nickname, setNickname] = useState('');
  const [ageBand, setAgeBand] = useState('8-12');
  const [handoff, setHandoff] = useState('');
  const [confirm, setConfirm] = useState<{ action: 'delete' | 'revoke'; rect: DOMRect } | null>(null);
  const status = useQuery({ queryKey: ['family', userId], enabled: ready, meta: { persist: false },
    queryFn: () => api.get<FamilyStatus & { privacyUrl?: string; childAppUrl?: string }>('/api/family/status'), staleTime: 0 });
  const detail = useQuery({ queryKey: ['family-child', userId, selected], enabled: ready && !!selected, meta: { persist: false },
    queryFn: () => api.get<ChildDetail>(`/api/family/children/${selected}`), staleTime: 0 });
  const verification = status.data?.verifications.find((v) => v.status === 'verified');
  async function perform(work: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await work(); setMessage(success); await qc.invalidateQueries({ queryKey: ['family', userId] });
      await qc.invalidateQueries({ queryKey: ['family-child', userId] }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function startChildMode() {
    if (busy || !selected || !status.data?.childAppUrl || detail.data?.child.status !== 'active') return;
    setBusy(true); setError('');
    try {
      // Mint at confirmation time, not when the settings page or dialog first opened.
      const result = await api.post<{ token: string }>(`/api/family/children/${selected}/handoff`);
      const childUrl = new URL(status.data.childAppUrl); childUrl.hash = result.token;
      await qc.cancelQueries();
      clearUserClientStorageCaches();
      await deletePersistedQueryCache();
      await clerk.signOut();
      qc.clear();
      window.location.assign(childUrl.href);
    } catch {
      setError('We couldn’t switch safely. Please try again before handing over this device.');
      setBusy(false);
    }
  }
  async function exportData(format: ChildExportFormat) {
    if (!ready || !selected || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await downloadChildNotebook(selected, format); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not download the notebook.'); }
    finally { setBusy(false); }
  }
  if (status.isPending) return <SettingsShell><p role="status">Loading your family…</p></SettingsShell>;
  if (status.isError) return <SettingsShell><p role="alert">Could not load your family.</p><button className="proto-settings-btn" onClick={() => status.refetch()}>Try again</button></SettingsShell>;
  const data = status.data;
  return <SettingsShell>
    <SettingsIntro>A private notebook for your child, with you beside them.</SettingsIntro>
    <div className="pds-family-stack">
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {!data.available && <p className="pds-caption" role="status">Child account setup is not open yet. Existing family accounts can still be managed here.</p>}
      {data.children.map((child) => <button key={child.id} className="proto-settings-btn proto-settings-btn--secondary"
        onClick={() => { setSelected(child.id); setHandoff(''); setConfirmChildMode(false); }}>
        {child.displayName} · {child.status === 'active' ? 'Active' : 'Consent withdrawn'}
      </button>)}
      {selected && detail.isPending && <p role="status">Loading child account…</p>}
      {selected && detail.isError && <p role="alert">Could not load this account. <button onClick={() => detail.refetch()}>Try again</button></p>}
      {selected && detail.data && <section className="pds-family-stack" aria-label={`${detail.data.child.displayName} account`}>
        <h2 className="pds-title">{detail.data.child.displayName}</h2>
        <p className="pds-caption">You can review this notebook. Ministry leaders cannot read it.</p>
        <button className="proto-settings-btn" disabled={busy || !data.available || detail.data.child.status !== 'active'} onClick={() => perform(async () => {
          const result = await api.post<{ token: string }>(`/api/family/children/${selected}/handoff`);
          const url = new URL(data.childAppUrl!); url.hash = result.token; setHandoff(url.href);
        }, 'The sign-in link is ready. It works once and expires in five minutes.')}>Create child sign-in link</button>
        {handoff && <label className="pds-caption">Open on your child’s device or a separate browser profile. Do not share publicly.
          <input className="proto-settings-field__input" aria-label="Child sign-in link" readOnly value={handoff} onFocus={(e) => e.target.select()} />
        </label>}
        <button className="proto-settings-btn" disabled={busy || !data.available || detail.data.child.status !== 'active'} onClick={() => setConfirmChildMode(true)}>Use child mode on this device</button>
        {confirmChildMode && <section className="pds-family-notice pds-family-stack" aria-label="Confirm child mode">
          <h3 className="pds-title">Switch to {detail.data.child.displayName}’s notebook?</h3>
          <p>You’ll be signed out before the notebook opens. Your child can use their approved features. Returning to your account requires signing in again.</p>
          <button className="proto-settings-btn" disabled={busy} onClick={() => void startChildMode()}>{busy ? 'Switching safely…' : 'Start child mode'}</button>
          <button className="proto-settings-btn proto-settings-btn--secondary" disabled={busy} onClick={() => setConfirmChildMode(false)}>Keep using my account</button>
        </section>}
        <button className="proto-settings-btn proto-settings-btn--secondary" disabled={busy} onClick={() => perform(() => api.delete(`/api/family/children/${selected}/sessions`), 'All child sessions ended.')}>End all sessions</button>
        <h3 className="pds-list-title">Approved ministries</h3>
        <p className="pds-caption">Your child can read these channels. Their notes and profile stay private.</p>
        {detail.data.ministries.length === 0 && <p className="pds-caption">Follow a ministry channel from your own account to approve it here.</p>}
        {detail.data.ministries.map((space) => <label className="pds-family-choice" key={space.id}>
          <input type="checkbox" disabled={busy || detail.data!.child.status !== 'active'}
            checked={detail.data!.approvals.some((a) => a.spaceId === space.id)}
            onChange={(e) => {
              const ids = detail.data!.approvals.map((a) => a.spaceId).filter((id) => detail.data!.ministries.some((s) => s.id === id));
              void perform(() => api.put(`/api/family/children/${selected}/ministries`, {
                spaceIds: e.target.checked ? [...ids, space.id] : ids.filter((id) => id !== space.id)
              }), 'Ministry access updated.');
            }} />{space.title}
        </label>)}
        <h3 className="pds-list-title">Notebook</h3>
        {detail.data.notes.length === 0 && <p className="pds-caption">No notes yet.</p>}
        {detail.data.notes.map((note) => <details key={note.id}><summary>{note.title || 'Untitled note'}</summary><p className="pds-family-note">{note.content}</p></details>)}
        <button className="proto-settings-btn proto-settings-btn--secondary" disabled={busy} onClick={() => void exportData('text')}>Download readable copy</button>
        <button className="proto-settings-btn proto-settings-btn--secondary" disabled={busy} onClick={() => void exportData('backup')}>Download notebook backup</button>
        <button className="proto-settings-btn proto-settings-btn--secondary" disabled={busy || detail.data.child.status !== 'active'} onClick={(e) => setConfirm({ action: 'revoke', rect: e.currentTarget.getBoundingClientRect() })}>Withdraw consent</button>
        <button className="proto-settings-btn proto-settings-btn--destructive" disabled={busy} onClick={(e) => setConfirm({ action: 'delete', rect: e.currentTarget.getBoundingClientRect() })}>Delete child account</button>
      </section>}
      {data.available && <section className="pds-family-stack" aria-label="Add a child">
        <h2 className="pds-title">Add a child</h2>
        <p className="pds-caption">First verify that you are an adult using the verified email on your Harvous account. This pilot is for children in the United States.</p>
        {!verification && <>
          <button className="proto-settings-btn" disabled={busy} onClick={() => perform(() => api.post('/api/family/verification', { location: 'US' }), 'Check your email for the Kids Web Services verification link.')}>Verify parent with KWS</button>
          <button className="proto-settings-btn proto-settings-btn--secondary" disabled={busy} onClick={() => status.refetch()}>Check verification status</button>
        </>}
        {verification && <>
          <ChildPrivacyNotice />
          <a href={data.privacyUrl} target="_blank" rel="noreferrer">Full child privacy policy and contact details</a>
          <label className="pds-family-choice"><input type="checkbox" checked={noticeAccepted} onChange={(e) => setNoticeAccepted(e.target.checked)} />
            I am the parent or legal guardian. My child is under 13 and lives in the United States. I have read the notice and consent to the collection and use described.</label>
          {noticeAccepted && <form className="pds-family-stack" onSubmit={(e) => { e.preventDefault(); void perform(async () => {
            await api.post('/api/family/children', { verificationId: verification.id, displayName: nickname, ageBand,
              noticeVersion: data.noticeVersion, consent: true, isGuardian: true });
            setNickname(''); setNoticeAccepted(false);
          }, 'Your child’s account is ready.'); }}>
            <label className="pds-caption">Nickname, not full name<input className="proto-settings-field__input" required maxLength={32} autoComplete="off" value={nickname} onChange={(e) => setNickname(e.target.value)} /></label>
            <label className="pds-caption">Age group<select className="proto-settings-field__input" value={ageBand} onChange={(e) => setAgeBand(e.target.value)}><option value="under-8">Under 8</option><option value="8-12">8–12</option></select></label>
            <button className="proto-settings-btn" disabled={busy || !nickname.trim()}>Agree and create child account</button>
          </form>}
        </>}
      </section>}
    </div>
    {confirm && <ProtoConfirmDialog anchorRect={confirm.rect} title={confirm.action === 'delete' ? 'Delete child account?' : 'Withdraw consent?'}
      description={confirm.action === 'delete' ? 'This permanently deletes the child’s notebook and ends all sessions. Export anything you want to keep first.' : 'Access stops immediately. You can export or delete the notebook for 30 days before automatic deletion.'}
      confirmLabel={confirm.action === 'delete' ? 'Delete account' : 'Withdraw consent'}
      onCancel={() => setConfirm(null)} onConfirm={() => {
        const action = confirm.action; setConfirm(null); setHandoff('');
        void perform(async () => {
          if (action === 'delete') { await api.delete(`/api/family/children/${selected}`); qc.removeQueries({ queryKey: ['family-child', userId, selected] }); setSelected(null); }
          else await api.post(`/api/family/children/${selected}/revoke`);
        }, action === 'delete' ? 'Child account deleted.' : 'Consent withdrawn. Child access has stopped.');
      }} />}
  </SettingsShell>;
}
