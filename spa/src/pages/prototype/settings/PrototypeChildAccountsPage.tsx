import Icon from '@/components/react/Icon';
import { prototypeHref } from '@/lib/prototype-path';
import { useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../../lib/api';
import { useAuthReady } from '../../../hooks/useAuthReady';
import { SettingsGroup, SettingsRow, SettingsShell } from './SettingsShell';
import ChildNotebookSettingsRow from './ChildNotebookSettingsRow';
import ProtoLoadingDots from '../ProtoLoadingDots';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import ManageChildNotebook from './ManageChildNotebook';
import { ChildNotebookCover } from '../ChildNotebookAppearance';
import ChildPrivacyNotice from '../../family/ChildPrivacyNotice';
import type { ChildDetail, FamilyChild, FamilyStatus } from '../../family/types';
import { useChildAccountsStatus } from '../../family/useChildAccountsStatus';
import { CHILD_NOTICE_VERSION, defaultChildPreferences } from '../../../../../shared/child-notebook';
import '../../../styles/family.css';

/** The whole journey up front: what each step is for, so a parent knows what they're agreeing to before they start. */
const setupSteps = [
  { title: 'Confirm you’re an adult', summary: 'Kids Web Services emails you a link to check. To send it, we share these from your verified Harvous account:', done: 'Verified by Kids Web Services.' },
  { title: 'See how we protect them', summary: 'What stays private, who can see what, and what you can change later.', done: 'Read.' },
  { title: 'Give permission and name it', summary: 'Agree to the notice, then choose the name your child will see on their notebook.', done: 'Done.' }
];

export default function PrototypeChildAccountsPage() {
  const ready = useAuthReady();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const search = new URLSearchParams(searchStr);
  const [feedback, setFeedback] = useState<{ scope: string; kind: 'error' | 'success'; text: string } | null>(null);
  const [verificationFeedback, setVerificationFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const status = useChildAccountsStatus();
  const requestedChild = search.get('child');
  const feedbackScope = requestedChild ?? (search.get('setup') === 'true' ? 'setup' : '');
  const visibleFeedback = feedback?.scope === feedbackScope ? feedback : null;
  const error = visibleFeedback?.kind === 'error' ? visibleFeedback.text : '';
  const message = visibleFeedback?.kind === 'success' ? visibleFeedback.text : '';
  const selected = status.data?.children.find((child) => child.id === requestedChild)?.id;
  const detail = useQuery({ queryKey: ['family-child', userId, selected], enabled: ready && !!selected, meta: { persist: false },
    queryFn: () => api.get<ChildDetail>(`/api/child-accounts/children/${selected}`), staleTime: 0 });
  const verification = status.data?.verifications.find((v) => v.status === 'verified');
  const enrollmentStep = verification ? (noticeAccepted ? 2 : 1) : 0;
  const awaitingVerification = status.data?.verifications.some((v) => v.status === 'pending');
  async function perform(work: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      if (success) setFeedback({ scope: feedbackScope, kind: 'success', text: success });
      await qc.invalidateQueries({ queryKey: ['family', userId, 'child-accounts'] });
      await qc.invalidateQueries({ queryKey: ['family-child', userId] });
    } catch (e) {
      setFeedback({ scope: feedbackScope, kind: 'error', text: e instanceof Error ? e.message : 'Please try again.' });
    }
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
  if (status.isPending) return <SettingsShell><ProtoSpaceLoading label="Loading your family" /></SettingsShell>;
  if (!status.data) return <SettingsShell><p role="alert">Could not load your family.</p><button className="proto-settings-btn" onClick={() => status.refetch()}>Try again</button></SettingsShell>;
  const data = status.data;
  const noticeMatches = data.noticeVersion === CHILD_NOTICE_VERSION;
  const notebookRoute = prototypeHref('settings/child-accounts');
  function openNotebook(child: string, replace = false) {
    void navigate({ to: notebookRoute, search: { child }, replace });
  }
  if (selected && detail.data) {
    return <ManageChildNotebook key={selected} detail={detail.data} childAppUrl={data.available ? data.childAppUrl : undefined} privacyUrl={data.privacyUrl}
      busy={busy} error={error} message={message} perform={perform} onDelete={() => {
        qc.setQueryData<FamilyStatus>(['family', userId, 'child-accounts'], current => current && ({
          ...current, children: current.children.filter(child => child.id !== selected),
        }));
        qc.removeQueries({ queryKey: ['family-child', userId, selected] });
        setFeedback({ scope: '', kind: 'success', text: 'Child account deleted.' });
        void navigate({ to: notebookRoute, search: {}, replace: true });
      }} />;
  }
  const canEnroll = data.available && !data.requiresPlus;
  const showEnrollment = canEnroll && !selected && (search.get('setup') === 'true' || data.children.length === 0);
  const showNotebookList = !selected && !showEnrollment && data.children.length > 0;
  const setupInProgress = !!verification || awaitingVerification;
  return <SettingsShell>
    <nav className="pds-family-breadcrumb pds-caption" aria-label="Settings breadcrumb">
      <Link to={prototypeHref('settings/family')}>My Family</Link>
      <Icon name="caret-right" size={10} aria-hidden />
      {showEnrollment && data.children.length > 0
        ? <Link to={notebookRoute} search={{}}>Child notebooks</Link>
        : <span aria-current="page">Child notebooks</span>}
    </nav>
    <div className="pds-family-stack">
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {!data.available && <p className="pds-caption" role="status">Child account setup is not open yet. Existing family accounts can still be managed here.</p>}
      {data.available && data.requiresPlus && !selected && <SettingsGroup>
        <SettingsRow leadingIcon="lock" label="Child notebook setup is included with Harvous Plus"
          sublabel="See Harvous Plus options" onClick={() => void navigate({ to: '/upgrade' })} />
      </SettingsGroup>}
      {showNotebookList && <section className="pds-family-stack" aria-labelledby="child-notebook-list-title">
        <h2 id="child-notebook-list-title" className="pds-title">Child notebooks</h2>
        <SettingsGroup>
          {data.children.map(child => <ChildNotebookSettingsRow key={child.id} child={child}
            onClick={() => openNotebook(child.id)} />)}
          {canEnroll && <SettingsRow leadingIcon={setupInProgress ? 'list-check' : 'plus'}
            label={setupInProgress ? 'Continue notebook setup' : 'Add another notebook'}
            onClick={() => void navigate({ to: notebookRoute, search: { setup: true } })} />}
        </SettingsGroup>
      </section>}
      {selected && detail.isPending && <ProtoSpaceLoading label="Loading the child notebook" />}
      {selected && detail.isError && <p role="alert">Could not load this account. <button onClick={() => detail.refetch()}>Try again</button></p>}
      {showEnrollment && <section className="pds-family-setup" aria-labelledby="child-enrollment-title">
        <header className="pds-family-setup__hero">
          <span className="pds-family-setup__art" aria-hidden="true">
            <ChildNotebookCover name="" preferences={{ ...defaultChildPreferences, coverSymbol: 'star', coverPattern: 'dots' }} large />
          </span>
          <div>
            <h2 id="child-enrollment-title" className="pds-title">A notebook for your child</h2>
            <p className="pds-subheadline">Their own private place to write about what they read and wonder.</p>
          </div>
        </header>
        <ol className="pds-family-setup__steps" aria-label="Notebook setup">
          {setupSteps.map((step, index) => {
            const state = index < enrollmentStep ? 'done' : index === enrollmentStep ? 'current' : 'later';
            const open = verification ? index > 0 : index === 0;
            return <li key={step.title} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="pds-family-setup__marker" aria-hidden="true">{state === 'done' ? <Icon name="check" size={11} /> : index + 1}</span>
              <div className="pds-family-setup__step">
                <h3 className="pds-list-title">{index === 0 && awaitingVerification ? 'Check your email' : step.title}{state === 'done' && <span className="sr-only">, complete</span>}</h3>
                <p className="pds-subheadline">{state === 'done' ? step.done : index === 0 && awaitingVerification
                  ? 'Open the email from Kids Web Services and complete verification. Then come back here to continue.' : step.summary}</p>
                {open && index === 0 && <div className="pds-family-setup__body" role="status">
                  {!awaitingVerification && <ul className="pds-family-verification__shared" aria-label="Shared with Kids Web Services">
                    <li><Icon name="envelope" size={11} aria-hidden /> Email</li>
                    <li><Icon name="location-dot" size={11} aria-hidden /> Country</li>
                    <li><Icon name="language" size={11} aria-hidden /> Language</li>
                  </ul>}
                  <div className="pds-family-verification__actions">
                    {awaitingVerification ? <>
                      <button className="proto-settings-btn" disabled={busy || status.isFetching} onClick={() => void checkVerification()}>
                        {status.isFetching && <ProtoLoadingDots />} Check verification status
                      </button>
                      <button className="proto-settings-btn proto-settings-btn--secondary" disabled={busy} onClick={sendVerification}>
                        {busy && <ProtoLoadingDots />} Send a new email
                      </button>
                    </> : <button className="proto-settings-btn" disabled={busy} onClick={sendVerification}>
                      {busy ? <ProtoLoadingDots /> : <Icon name="envelope" size={14} aria-hidden />} Send verification email
                    </button>}
                  </div>
                  {verificationFeedback && awaitingVerification && <p className="pds-body" role="status">{verificationFeedback}</p>}
                </div>}
                {open && index === 1 && verification && <div className="pds-family-setup__body">
                <section aria-label="Your child’s privacy">
                              <SettingsGroup>
                    <SettingsRow leadingIcon="lock" trailing="none" label="A private notebook"
                      sublabel="You and your child can read their notes. You can also download a copy." />
                    <SettingsRow leadingIcon="book-open" trailing="none" label="Ministry reading you approve"
                      sublabel="Approved channels are read-only. Ministry leaders can’t see your child’s notes or profile." />
                    <SettingsRow leadingIcon="user-shield" trailing="none" label="Settings you manage"
                      sublabel="End sessions, remove ministry access, withdraw consent, or delete the notebook in Family settings." />
                    <details className="pds-family-privacy__disclosure" open>
                      <summary className="proto-note-row proto-settings-row pds-family-privacy__action">
                        <span className="pds-list-title">Read the full privacy notice</span>
                        <Icon name="chevron-down" size={12} aria-hidden />
                      </summary>
                      <ChildPrivacyNotice privacyUrl={data.privacyUrl} />
                    </details>
                    <a className="proto-note-row proto-settings-row pds-family-privacy__action" href={data.privacyUrl} target="_blank" rel="noreferrer">
                      <span className="pds-list-title">Privacy policy and contact details</span>
                      <Icon name="arrow-up-right-from-square" size={12} aria-hidden />
                    </a>
                  </SettingsGroup>
                </section>
                </div>}
                {open && index === 2 && verification && <div className="pds-family-setup__body">
                <section className="pds-family-consent" aria-label="Give permission">
                              {!noticeMatches && <p role="status" className="pds-caption">Reload Harvous to review the latest child privacy notice before giving permission.</p>}
                  <label className="pds-family-choice pds-subheadline">
                    <input type="checkbox" className="proto-checkbox--accent" checked={noticeAccepted}
                      disabled={busy || !noticeMatches} onChange={(e) => setNoticeAccepted(e.target.checked)} />
                    <span>I am the parent or legal guardian. My child is under 13 and lives in the United States. I have read the notice and consent to the collection and use of my child’s information it describes.</span>
                  </label>
                  {noticeAccepted && noticeMatches && <form className="pds-family-stack pds-family-consent__form" onSubmit={(e) => {
                    e.preventDefault();
                    void perform(async () => {
                      const { child } = await api.post<{ child: FamilyChild }>('/api/child-accounts/children', { verificationId: verification.id, displayName,
                        noticeVersion: CHILD_NOTICE_VERSION, consent: true, isGuardian: true });
                      qc.setQueryData<FamilyStatus>(['family', userId, 'child-accounts'], (current) => current && ({
                        ...current,
                        children: [...current.children.filter((item) => item.id !== child.id), child],
                        verifications: current.verifications.filter((item) => item.id !== verification.id),
                      }));
                      openNotebook(child.id, true);
                      setDisplayName('');
                      setNoticeAccepted(false);
                    }, '');
                  }}>
                    <label className="pds-list-title pds-family-consent__name">First Name
                      <input className="proto-settings-field__input" placeholder="e.g. Sam" required maxLength={32} autoComplete="off"
                        aria-describedby="child-first-name-hint" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                      <span id="child-first-name-hint" className="pds-caption">Use a first name or nickname. Leave out the last name.</span>
                    </label>
                    <button className="proto-settings-btn" type="submit" disabled={busy || !displayName.trim()}>
                      {busy ? <ProtoLoadingDots /> : <Icon name="book-open" size={14} aria-hidden />} Agree and create notebook
                    </button>
                  </form>}
                </section>
                </div>}
              </div>
            </li>;
          })}
        </ol>
        <p className="pds-caption pds-family-setup__fineprint">
          For children under 13 in the United States. <a className="pds-kids-policy-link" href={data.privacyUrl} target="_blank" rel="noreferrer">Child privacy policy</a>
        </p>
      </section>}
    </div>
  </SettingsShell>;
}
