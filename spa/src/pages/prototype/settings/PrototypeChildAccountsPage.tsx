import Icon from '@/components/react/Icon';
import { prototypeHref } from '@/lib/prototype-path';
import { useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../../lib/api';
import { useAuthReady } from '../../../hooks/useAuthReady';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from './SettingsShell';
import ManageChildNotebook from './ManageChildNotebook';
import ChildPrivacyNotice from '../../family/ChildPrivacyNotice';
import type { ChildDetail, FamilyChild, FamilyStatus } from '../../family/types';
import { useChildAccountsStatus } from '../../family/useChildAccountsStatus';
import '../../../styles/family.css';

const enrollmentSteps = ['Verify adult', 'Review privacy', 'Create notebook'];

export default function PrototypeChildAccountsPage() {
  const ready = useAuthReady();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const search = new URLSearchParams(searchStr);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [verificationFeedback, setVerificationFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const status = useChildAccountsStatus();
  const requestedChild = search.get('child');
  const selected = status.data?.children.find((child) => child.id === requestedChild)?.id;
  const detail = useQuery({ queryKey: ['family-child', userId, selected], enabled: ready && !!selected, meta: { persist: false },
    queryFn: () => api.get<ChildDetail>(`/api/child-accounts/children/${selected}`), staleTime: 0 });
  const verification = status.data?.verifications.find((v) => v.status === 'verified');
  const enrollmentStep = verification ? (noticeAccepted ? 2 : 1) : 0;
  const awaitingVerification = status.data?.verifications.some((v) => v.status === 'pending');
  async function perform(work: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await work(); setMessage(success); await qc.invalidateQueries({ queryKey: ['family', userId, 'child-accounts'] });
      await qc.invalidateQueries({ queryKey: ['family-child', userId] }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  function sendVerification() {
    setVerificationFeedback('');
    void perform(() => api.post('/api/child-accounts/verification', { location: 'US' }), '');
  }
  async function checkVerification() {
    setVerificationFeedback('');
    const result = await status.refetch();
    if (result.isError) {
      setVerificationFeedback('Couldn’t check verification. Please try again.');
    } else if (!result.data?.verifications.some((v) => v.status === 'verified')) {
      setVerificationFeedback('Verification is still pending.');
    }
  }
  if (status.isPending) return <SettingsShell><p role="status">Loading your family…</p></SettingsShell>;
  if (!status.data) return <SettingsShell><p role="alert">Could not load your family.</p><button className="proto-settings-btn" onClick={() => status.refetch()}>Try again</button></SettingsShell>;
  const data = status.data;
  const notebookRoute = prototypeHref('settings/child-accounts');
  function openNotebook(child: string, replace = false) {
    void navigate({ to: notebookRoute, search: { child }, replace });
  }
  if (selected && detail.data) {
    return <ManageChildNotebook key={selected} detail={detail.data} childAppUrl={data.available ? data.childAppUrl : undefined}
      busy={busy} error={error} message={message} perform={perform} onDelete={() => {
        qc.setQueryData<FamilyStatus>(['family', userId, 'child-accounts'], current => current && ({
          ...current, children: current.children.filter(child => child.id !== selected),
        }));
        qc.removeQueries({ queryKey: ['family-child', userId, selected] });
        void navigate({ to: notebookRoute, search: {}, replace: true });
      }} />;
  }
  const showEnrollment = data.available && !data.requiresPlus && !selected && (
    search.get('setup') === 'true' || data.children.length === 0 || verification || awaitingVerification
  );
  return <SettingsShell>
    <nav className="pds-family-breadcrumb pds-caption" aria-label="Settings breadcrumb">
      <Link to={prototypeHref('settings/family')}>My Family</Link>
      <Icon name="caret-right" size={10} aria-hidden />
      <span aria-current="page">Child notebooks</span>
    </nav>
    {showEnrollment && !verification && <SettingsIntro>A private notebook for your child, with you beside them.</SettingsIntro>}
    <div className="pds-family-stack">
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {!data.available && <p className="pds-caption" role="status">Child account setup is not open yet. Existing family accounts can still be managed here.</p>}
      {data.available && data.requiresPlus && !selected && <SettingsGroup>
        <SettingsRow leadingIcon="lock" label="Child notebook setup is included with Harvous Plus"
          sublabel="See Harvous Plus options" onClick={() => void navigate({ to: '/upgrade' })} />
      </SettingsGroup>}
      {!selected && data.children.length > 0 && <SettingsGroup>
        {data.children.map(child => <SettingsRow key={child.id} leadingIcon="book-open"
          label={`${child.displayName}’s notebook`} sublabel={child.status === 'active' ? 'Open or manage notebook' : 'Consent withdrawn'}
          onClick={() => openNotebook(child.id)} />)}
      </SettingsGroup>}
      {selected && detail.isPending && <p role="status">Loading child account…</p>}
      {selected && detail.isError && <p role="alert">Could not load this account. <button onClick={() => detail.refetch()}>Try again</button></p>}
      {showEnrollment && <section className={verification ? 'pds-family-stack pds-family-enrollment--verified' : 'pds-family-stack'} aria-labelledby="child-enrollment-title">
        <header className="pds-family-enrollment-heading">
          <h2 id="child-enrollment-title" className="pds-title">Set up a child notebook</h2>
          <ol className="pds-family-enrollment-progress" aria-label="Notebook setup progress">
            {enrollmentSteps.map((step, index) => (
              <li key={step} className="pds-caption" aria-current={index === enrollmentStep ? 'step' : undefined}
                data-complete={index < enrollmentStep || undefined}>
                <span className="pds-family-enrollment-progress__marker" aria-hidden="true">
                  {index < enrollmentStep ? <Icon name="check" size={11} /> : index + 1}
                </span>
                {step}{index < enrollmentStep && <span className="sr-only">, complete</span>}
              </li>
            ))}
          </ol>
        </header>
        {!verification && <div className="pds-family-verification pds-family-stack">
          <div className="pds-family-verification__header">
            <span className="pds-family-verification__icon" aria-hidden="true">
              <Icon name={awaitingVerification ? 'envelope' : 'user-shield'} size={18} />
            </span>
            <div role="status">
              <h3 className="pds-list-title">{awaitingVerification ? 'Check your email' : 'Verify you’re an adult'}</h3>
              <p className="pds-body">
                {awaitingVerification
                  ? 'Open the email from Kids Web Services and complete verification. Then come back here to continue.'
                  : 'Kids Web Services will send a verification link to the email on your Harvous account.'}
              </p>
            </div>
          </div>
          <div className="pds-family-verification__actions">
            {awaitingVerification ? <>
              <button className="proto-settings-btn" disabled={busy || status.isFetching} onClick={() => void checkVerification()}>
                Check verification status
              </button>
              <button className="proto-settings-btn proto-settings-btn--secondary" disabled={busy} onClick={sendVerification}>
                Send a new email
              </button>
            </> : <button className="proto-settings-btn" disabled={busy} onClick={sendVerification}>
              <Icon name="envelope" size={14} aria-hidden /> Send verification email
            </button>}
          </div>
          {verificationFeedback && awaitingVerification && <p className="pds-body" role="status">{verificationFeedback}</p>}
          {!awaitingVerification && <p className="pds-caption">For children under 13 in the United States.</p>}
        </div>}
        {verification && <>
          <section aria-labelledby="child-privacy-title">
            <h3 id="child-privacy-title" className="pds-caption pds-family-enrollment-label">Your child’s privacy</h3>
            <SettingsGroup>
              <SettingsRow leadingIcon="lock" trailing="none" label="A private notebook"
                sublabel="You and your child can read their notes. You can also download a copy." />
              <SettingsRow leadingIcon="book-open" trailing="none" label="Ministry reading you approve"
                sublabel="Approved channels are read-only. Ministry leaders can’t see your child’s notes or profile." />
              <SettingsRow leadingIcon="user-shield" trailing="none" label="Settings you manage"
                sublabel="End sessions, remove ministry access, withdraw consent, or delete the notebook in Family settings." />
              <details className="pds-family-privacy__disclosure">
                <summary className="proto-note-row proto-settings-row pds-family-privacy__action">
                  <span className="pds-list-title">Read the full privacy notice</span>
                  <Icon name="chevron-down" size={12} aria-hidden />
                </summary>
                <ChildPrivacyNotice />
              </details>
              <a className="proto-note-row proto-settings-row pds-family-privacy__action" href={data.privacyUrl} target="_blank" rel="noreferrer">
                <span className="pds-list-title">Privacy policy and contact details</span>
                <Icon name="arrow-up-right-from-square" size={12} aria-hidden />
              </a>
            </SettingsGroup>
          </section>

          <section className="pds-family-consent" aria-labelledby="child-consent-title">
            <h3 id="child-consent-title" className="pds-caption pds-family-enrollment-label">Give permission</h3>
            <label className="pds-family-choice pds-subheadline">
              <input type="checkbox" className="proto-checkbox--accent" checked={noticeAccepted}
                disabled={busy} onChange={(e) => setNoticeAccepted(e.target.checked)} />
              <span>I am the parent or legal guardian. My child is under 13 and lives in the United States. I have read the notice and consent to the collection and use described.</span>
            </label>
            {noticeAccepted && <form className="pds-family-stack pds-family-consent__form" onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                const { child } = await api.post<{ child: FamilyChild }>('/api/child-accounts/children', { verificationId: verification.id, displayName,
                  noticeVersion: data.noticeVersion, consent: true, isGuardian: true });
                qc.setQueryData<FamilyStatus>(['family', userId, 'child-accounts'], (current) => current && ({
                  ...current,
                  children: [...current.children.filter((item) => item.id !== child.id), child],
                  verifications: current.verifications.filter((item) => item.id !== verification.id),
                }));
                openNotebook(child.id, true);
                setDisplayName('');
                setNoticeAccepted(false);
              }, 'Your child’s account is ready.');
            }}>
              <label className="pds-list-title pds-family-consent__name">First Name
                <input className="proto-settings-field__input" placeholder="e.g. Sam" required maxLength={32} autoComplete="off"
                  aria-describedby="child-first-name-hint" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                <span id="child-first-name-hint" className="pds-caption">Use a first name or nickname. Leave out the last name.</span>
              </label>
              <button className="proto-settings-btn" type="submit" disabled={busy || !displayName.trim()}>
                <Icon name="book-open" size={14} aria-hidden /> {busy ? 'Creating notebook…' : 'Agree and create notebook'}
              </button>
            </form>}
          </section>
        </>}
      </section>}
    </div>
  </SettingsShell>;
}
