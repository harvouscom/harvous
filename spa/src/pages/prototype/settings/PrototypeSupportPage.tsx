import '@/styles/scripture-pill-chrome.css';
import { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/react/Icon';
import { buildFounderMailto, FOUNDER_EMAIL, type FeedbackTopic } from '@/utils/support-mailto';
import { collectSupportClientContext } from '@/utils/support-client-context';
import { submitSupportTicket } from '@/utils/support-tickets';
import { useProfile } from '../../../hooks/queries/useProfile';
import { SettingsCopyRow, SettingsGroup, SettingsShell } from './SettingsShell';

const TOPICS: FeedbackTopic[] = ['Bug', 'Idea', 'Question'];

function appVersionRaw(): string | undefined {
  return (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__;
}

function appVersionLabel(): string {
  const v = appVersionRaw();
  return v ? `Version ${v}` : '';
}

export default function PrototypeSupportPage() {
  const { data: profile } = useProfile();
  const [topic, setTopic] = useState<FeedbackTopic | undefined>();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const versionLabel = appVersionLabel();
  const canSend = message.trim().length > 0 && !pending;

  const handleSend = async () => {
    if (!canSend) return;
    setPending(true);
    try {
      await submitSupportTicket({
        message,
        topic,
        appVersion: appVersionRaw(),
        pageUrl: window.location.href,
        clientEnvironment: collectSupportClientContext().clientEnvironment,
      });
      setMessage('');
      setTopic(undefined);
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your note');
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingsShell>
      <div className="proto-support-founder">
        <img
          src="/derek-avatar.jpeg"
          alt="Derek Castelli"
          className="proto-support-founder__avatar"
        />
        <div className="proto-support-founder__text">
          <p className="proto-support-founder__intro">
            I&apos;m Derek, the founder. Questions, bugs, ideas — I read everything myself. Let me know how I can help.
          </p>
          <p className="proto-support-founder__byline">
            <span className="proto-support-founder__name">Derek Castelli</span>
            <span className="proto-support-founder__title">Founder of Harvous</span>
          </p>
        </div>
      </div>

      <SettingsGroup>
        <SettingsCopyRow
          value={FOUNDER_EMAIL}
          href={buildFounderMailto()}
          copyErrorMessage="Could not copy email"
        />
      </SettingsGroup>

      {sent ? (
        <p className="proto-support-form__sent" role="status">
          Your note was sent. I&apos;ll get back to you
          {profile?.email ? ` at ${profile.email}` : ''}.
        </p>
      ) : null}

      <div className="proto-support-form">
        <p className="proto-home-greeting proto-support-form__intro">
          What&apos;s on your mind? Pick a topic below, write your note, and I&apos;ll get back to you.
        </p>
        <p className="pds-inspector-label proto-support-form__topic-label">Topic</p>
        <div className="proto-chip-bar proto-support-form__chip-bar" role="group" aria-label="Feedback type">
          {TOPICS.map((t) => {
            const selected = topic === t;
            return (
              <button
                key={t}
                type="button"
                className={`proto-chip${selected ? ' proto-chip--selected' : ''}`}
                aria-pressed={selected}
                onClick={() => setTopic((current) => (current === t ? undefined : t))}
              >
                {t}
              </button>
            );
          })}
        </div>
        <textarea
          className="proto-support-form__textarea"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (sent) setSent(false);
          }}
          placeholder="What's on your mind?"
          rows={5}
        />
        <button
          type="button"
          className="proto-settings-btn"
          disabled={!canSend}
          onClick={() => void handleSend()}
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {versionLabel ? (
        <footer className="proto-support-version scripture-pill-chrome__attribution">
          <Icon name="circle-info" size={9} className="scripture-pill-chrome__attribution-icon" aria-hidden />
          <p className="scripture-pill-chrome__attribution-copyright">{versionLabel}</p>
        </footer>
      ) : null}
    </SettingsShell>
  );
}
