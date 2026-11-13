import Icon from '@/components/react/Icon';
import { prototypeHref } from '@/lib/prototype-path';
import { clearUserClientStorageCaches } from '@/utils/clear-user-client-caches';
import { deletePersistedQueryCache } from '@/utils/query-cache-persistence';
import { useClerk } from '@clerk/clerk-react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import ManageChildFamilyBible from '../../family/ManageChildFamilyBible';
import MoveChildNotebook from './MoveChildNotebook';
import { downloadChildNotebook, type ChildExportFormat } from '../../family/download-child-notebook';
import type { ChildDetail } from '../../family/types';
import { ChildNotebookCover } from '../ChildNotebookAppearance';
import ProtoLoadingDots from '../ProtoLoadingDots';
import ProtoConfirmDialog from '../ProtoConfirmDialog';
import ChildPrivacyNotice from '../../family/ChildPrivacyNotice';
import { CHILD_NOTICE_VERSION } from '../../../../../shared/child-notebook';
import { SettingsCopyRow, SettingsGroup, SettingsIntro, SettingsRow, SettingsShell, SettingsSubScreen, SettingsToggleRow } from './SettingsShell';
import '../../../styles/child-notebook-preview.css';

const paneTitles = {
  bible: 'Family Bible',
  ministries: 'Ministry reading',
  notes: 'Notes and exports',
  privacy: 'Privacy and sessions',
  move: 'Move to their own account',
};

type Pane = keyof typeof paneTitles;

type Props = {
  detail: ChildDetail;
  childAppUrl?: string;
  /** The published Children's Privacy Policy, linked inside the renewal notice (§312.4(c)(1)(v)). */
  privacyUrl?: string;
  busy: boolean;
  error: string;
  message: string;
  perform: (work: () => Promise<unknown>, message: string) => Promise<void>;
  onDelete: () => void;
};

export default function ManageChildNotebook({ detail, childAppUrl, privacyUrl, busy, error, message, perform, onDelete }: Props) {
  const { child, notes, readings, ministries, approvals } = detail;
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const [pane, setPane] = useState<Pane | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [handoff, setHandoff] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(child.displayName);
  const [confirm, setConfirm] = useState<{ action: 'delete' | 'revoke'; anchor: HTMLButtonElement } | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const endpoint = `/api/child-accounts/children/${encodeURIComponent(child.id)}`;
  const active = child.status === 'active';
  // Agreed under an older privacy notice: paused until the parent reviews and agrees again.
  const needsRenewal = active && child.noticeVersion !== CHILD_NOTICE_VERSION;
  const [renewAccepted, setRenewAccepted] = useState(false);
  const disabled = busy || switching;
  const canOpen = !!childAppUrl && active && !needsRenewal && !disabled;
  const title = `${child.displayName}’s notebook`;

  useLayoutEffect(() => {
    screenRef.current?.closest('.proto-settings__detail, .proto-settings-sheet__body')?.scrollTo({ top: 0 });
  }, [pane]);

  async function makeHandoffUrl() {
    const url = new URL(childAppUrl!);
    const { token } = await api.post<{ token: string }>(`${endpoint}/handoff`);
    url.hash = token;
    return url.href;
  }

  async function startChildMode() {
    if (!canOpen) return;
    setSwitching(true);
    setSwitchError('');
    setHandoff('');
    try {
      const url = await makeHandoffUrl();
      await queryClient.cancelQueries();
      clearUserClientStorageCaches();
      await deletePersistedQueryCache();
      await clerk.signOut();
      queryClient.clear();
      window.location.assign(url);
    } catch {
      setSwitchError('We couldn’t switch safely. Please try again before handing over this device.');
      setSwitching(false);
    }
  }

  function showPane(next: Pane | null) {
    setSwitchOpen(false);
    setSwitchError('');
    setPane(next);
  }

  function download(format: ChildExportFormat) {
    void perform(() => downloadChildNotebook(child.id, format), '');
  }

  const feedback = (
    <>
      {error && <p className="pds-caption pds-family-management__error" role="alert">{error}</p>}
      {message && <p className="pds-caption pds-family-management__message" role="status">{message}</p>}
    </>
  );

  return (
    <div ref={screenRef}>
      {pane === null ? (
        <SettingsShell>
          <nav className="pds-family-breadcrumb pds-caption" aria-label="Settings breadcrumb">
            <Link to={prototypeHref('settings/family')}>My Family</Link>
            <Icon name="caret-right" size={10} aria-hidden />
            <Link to={prototypeHref('settings/child-accounts')} search={{}}>Child notebooks</Link>
          </nav>
          <header className="pds-family-management__identity">
            <ChildNotebookCover name={child.displayName} preferences={child.notebookPreferences} />
            {renaming ? <form className="pds-family-rename" onSubmit={event => {
              event.preventDefault();
              const next = name.trim();
              if (!next || next === child.displayName) { setRenaming(false); return; }
              void perform(async () => { await api.put(`${endpoint}/name`, { displayName: next }); setRenaming(false); }, 'Renamed.');
            }}>
              <label className="pds-caption" htmlFor="child-notebook-name">Name on the notebook</label>
              <input id="child-notebook-name" className="proto-settings-field__input" value={name} maxLength={32} required autoFocus
                autoComplete="off" disabled={disabled} aria-describedby="child-notebook-name-hint"
                onChange={event => setName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setName(child.displayName); setRenaming(false); } }} />
              <span id="child-notebook-name-hint" className="pds-caption">A first name or nickname. Your child sees it on their notebook.</span>
              <div className="pds-family-rename__actions">
                <button type="button" className="proto-settings-btn proto-settings-btn--secondary" disabled={disabled}
                  onClick={() => { setName(child.displayName); setRenaming(false); }}>Cancel</button>
                <button type="submit" className="proto-settings-btn" disabled={disabled || !name.trim()}>{busy ? <ProtoLoadingDots /> : null} Save</button>
              </div>
            </form> : <div>
              <div className="pds-family-management__title">
                <h2 className="pds-title">{title}</h2>
                <button type="button" className="proto-toolbar-icon-btn" aria-label={`Rename ${title}`} title="Rename" disabled={disabled}
                  onClick={() => { setName(child.displayName); setRenaming(true); }}>
                  <Icon name="pen" size={13} aria-hidden />
                </button>
              </div>
              <p className="pds-caption">{!active ? 'Consent withdrawn' : needsRenewal ? 'Paused until you review the updated notice' : 'Parent-managed notebook'}</p>
            </div>}
          </header>
          {feedback}

          {needsRenewal && <section className="pds-family-renewal" aria-labelledby="child-renewal-title">
            <span className="pds-family-renewal__icon" aria-hidden="true"><Icon name="user-shield" size={16} /></span>
            <div className="pds-family-renewal__body">
              <h3 id="child-renewal-title" className="pds-list-title">We updated our child privacy notice</h3>
              <p className="pds-subheadline">{child.displayName}’s notebook is paused until you review the changes and agree again. Their notes are safe in the meantime.</p>
              <details className="pds-family-privacy__disclosure pds-family-renewal__notice">
                <summary className="pds-list-title">Read the updated notice <Icon name="chevron-down" size={12} aria-hidden /></summary>
                <ChildPrivacyNotice privacyUrl={privacyUrl} />
              </details>
              <label className="pds-family-choice pds-subheadline">
                <input type="checkbox" className="proto-checkbox--accent" checked={renewAccepted} disabled={disabled}
                  onChange={event => setRenewAccepted(event.target.checked)} />
                <span>I am the parent or legal guardian. My child is under 13 and lives in the United States. I have read the updated notice and consent to the collection and use of my child’s information it describes.</span>
              </label>
              <button type="button" className="proto-settings-btn" disabled={disabled || !renewAccepted}
                onClick={() => void perform(async () => {
                  await api.post(`${endpoint}/consent`, { noticeVersion: CHILD_NOTICE_VERSION, isGuardian: true, consent: true });
                  setRenewAccepted(false);
                }, `${child.displayName}’s notebook is open again.`)}>
                {busy ? <ProtoLoadingDots /> : <Icon name="check" size={13} aria-hidden />} Agree and resume notebook
              </button>
            </div>
          </section>}

          <h3 className="pds-caption pds-family-enrollment-label">Open the notebook</h3>
          {!childAppUrl && <p className="pds-caption pds-family-management__message">Child sign-in is unavailable right now.</p>}
          <SettingsGroup>
            <SettingsRow label="Use child mode on this device" leadingIcon="arrow-right-arrow-left"
              sublabel="Signs you out before opening the notebook" disabled={!canOpen} expanded={switchOpen}
              onClick={() => { setSwitchError(''); setSwitchOpen(!switchOpen); }} />
            {switchOpen && <section className="pds-family-management__inline" aria-label="Confirm child mode">
              <p className="pds-subheadline">You’ll need to sign in again to return to your account.</p>
              {switchError && <p className="pds-caption pds-family-management__error" role="alert">{switchError}</p>}
              <div className="pds-family-verification__actions">
                <button type="button" className="proto-settings-btn" disabled={!canOpen} onClick={() => void startChildMode()}>
                  {switching ? <ProtoLoadingDots /> : <Icon name="arrow-right-arrow-left" size={13} aria-hidden />} Start child mode
                </button>
                <button type="button" className="proto-settings-btn proto-settings-btn--secondary" disabled={switching}
                  onClick={() => setSwitchOpen(false)}>Cancel</button>
              </div>
            </section>}
            <SettingsRow label="Create child sign-in link" leadingIcon="link"
              sublabel="For a separate device or browser profile" disabled={!canOpen}
              onClick={() => void perform(async () => {
                setSwitchOpen(false);
                setHandoff('');
                setHandoff(await makeHandoffUrl());
              }, '')} />
            {handoff && <div className="pds-family-management__inline">
              <SettingsCopyRow value="One-time sign-in link" copyValue={handoff} layout="field" copyLabel="Copy link" />
              <p className="pds-caption pds-family-management__link-help" role="status">Open on your child’s device or in a separate browser profile within five minutes.</p>
            </div>}
          </SettingsGroup>

          <h3 className="pds-caption pds-family-enrollment-label">Manage notebook</h3>
          <SettingsGroup>
            <SettingsRow label={paneTitles.bible} leadingIcon="book-open"
              sublabel={readings.length ? `${readings.length} shared ${readings.length === 1 ? 'chapter' : 'chapters'} · Approved translations` : 'Approved translations and shared chapters'}
              disabled={disabled} onClick={() => showPane('bible')} />
            <SettingsRow label={paneTitles.ministries} leadingIcon="church"
              sublabel={approvals.length ? `${approvals.length} approved ${approvals.length === 1 ? 'channel' : 'channels'}` : 'Choose channels your child can read'}
              disabled={disabled} onClick={() => showPane('ministries')} />
            <SettingsRow label={paneTitles.notes} leadingIcon="note-sticky"
              sublabel={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'} · Read or download a copy`}
              disabled={disabled} onClick={() => showPane('notes')} />
            <SettingsRow label={paneTitles.privacy} leadingIcon="user-shield" sublabel="Manage sign-ins, consent, and deletion"
              disabled={disabled} onClick={() => showPane('privacy')} />
          </SettingsGroup>
          <SettingsGroup>
            <SettingsRow label={paneTitles.move} leadingIcon="seedling"
              sublabel={detail.move ? `Link open until ${new Date(detail.move.expiresAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}` : 'When they turn 13, they keep everything they wrote'}
              disabled={disabled || !active} onClick={() => showPane('move')} />
          </SettingsGroup>
        </SettingsShell>
      ) : pane === 'bible' ? (
        <ManageChildFamilyBible detail={detail} busy={busy} perform={perform} feedback={feedback}
          backLabel={`Back to ${title}`} onBack={() => showPane(null)} />
      ) : (
        <SettingsSubScreen title={paneTitles[pane]} backLabel={`Back to ${title}`} onBack={() => showPane(null)}>
          <div className="proto-settings__content">
            {feedback}
            {pane === 'ministries' && <>
              <SettingsIntro>Your child can read approved channels. Their notebook and profile stay private.</SettingsIntro>
              <SettingsGroup>
                {ministries.length === 0 ? <SettingsRow leadingIcon="church" trailing="none" label="No ministry channels to approve"
                  sublabel="Follow a ministry channel from your account to make it available here." /> : ministries.map(space => (
                  <SettingsToggleRow key={space.id} label={space.title} disabled={disabled || !active}
                    checked={approvals.some(approval => approval.spaceId === space.id)}
                    onChange={approved => {
                      const ids = approvals.map(approval => approval.spaceId).filter(id => ministries.some(ministry => ministry.id === id));
                      void perform(() => api.put(`${endpoint}/ministries`, {
                        spaceIds: approved ? [...ids, space.id] : ids.filter(id => id !== space.id),
                      }), 'Ministry access updated.');
                    }} />
                ))}
              </SettingsGroup>
            </>}
            {pane === 'notes' && <>
              <SettingsIntro>You can read and export these notes. Ministry leaders can’t see them.</SettingsIntro>
              <SettingsGroup>
                {notes.length === 0 ? <SettingsRow leadingIcon="note-sticky" label="No notes yet" trailing="none" /> : notes.map(note => (
                  <details key={note.id} className="pds-family-privacy__disclosure">
                    <summary className="proto-note-row proto-settings-row pds-family-privacy__action">
                      <span className="pds-list-title">{note.title || 'Untitled note'}</span>
                      <Icon name="chevron-down" size={12} aria-hidden />
                    </summary>
                    <p className="pds-family-note pds-family-management__inline pds-subheadline">{note.content}</p>
                  </details>
                ))}
              </SettingsGroup>
              <h3 className="pds-caption pds-family-enrollment-label">Download</h3>
              <SettingsGroup>
                <SettingsRow label="Download readable copy" leadingIcon="download" sublabel="Plain text" trailing="none"
                  disabled={disabled} onClick={() => download('text')} />
                <SettingsRow label="Download notebook backup" leadingIcon="download" sublabel="Includes folders, tags, and Threads" trailing="none"
                  disabled={disabled} onClick={() => download('backup')} />
              </SettingsGroup>
            </>}
            {pane === 'move' && <MoveChildNotebook detail={detail} busy={busy} perform={perform} />}
            {pane === 'privacy' && <>
              {!!detail.consents?.length && <section aria-labelledby="child-consent-history-title">
                <h3 id="child-consent-history-title" className="pds-caption pds-family-enrollment-label">Consent history</h3>
                <SettingsGroup>
                  {[...detail.consents].reverse().map(item => <SettingsRow key={`${item.consentedAt}:${item.noticeVersion}`} trailing="none"
                    leadingIcon={item.kind === 'renewed' ? 'arrows-rotate' : 'user-shield'}
                    label={`${item.kind === 'renewed' ? 'Renewed' : 'Gave'} consent · ${new Date(item.consentedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`}
                    sublabel={`Privacy notice ${item.noticeVersion}${item.noticeVersion === CHILD_NOTICE_VERSION ? ' (current)' : ''}`} />)}
                </SettingsGroup>
              </section>}
              <SettingsGroup>
                <SettingsRow label="End all sessions" leadingIcon="lock" sublabel="Signs your child out on every device"
                  trailing="none" disabled={disabled} onClick={() => void perform(async () => {
                    await api.delete(`${endpoint}/sessions`);
                    setHandoff('');
                  }, 'All child sessions ended.')} />
              </SettingsGroup>
              <div className="proto-settings-danger">
                <h3 className="proto-settings-danger__label pds-caption">Consent and deletion</h3>
                <div className="proto-settings-danger__actions">
                  <button type="button" className="proto-settings-danger__btn" disabled={disabled || !active}
                    onClick={e => setConfirm({ action: 'revoke', anchor: e.currentTarget })}>Withdraw consent</button>
                  <button type="button" className="proto-settings-danger__btn" disabled={disabled}
                    onClick={e => setConfirm({ action: 'delete', anchor: e.currentTarget })}>Delete child account</button>
                </div>
              </div>
            </>}
          </div>
        </SettingsSubScreen>
      )}
      {confirm && <ProtoConfirmDialog anchorEl={confirm.anchor}
        title={confirm.action === 'delete' ? 'Delete child account?' : 'Withdraw consent?'}
        description={confirm.action === 'delete'
          ? 'This permanently deletes the child’s notebook and ends all sessions. Export anything you want to keep first.'
          : 'Access stops immediately. You have 30 days to export the notebook before automatic deletion.'}
        confirmLabel={confirm.action === 'delete' ? 'Delete account' : 'Withdraw consent'}
        onCancel={() => setConfirm(null)} onConfirm={() => {
          const { action } = confirm;
          setConfirm(null);
          void perform(async () => {
            if (action === 'delete') {
              await api.delete(endpoint);
              onDelete();
            } else {
              await api.post(`${endpoint}/revoke`);
              setHandoff('');
            }
          }, action === 'delete' ? '' : 'Consent withdrawn. Child access has stopped.');
        }} />}
    </div>
  );
}
