import '@/styles/scripture-pill-chrome.css';
import { useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  buildFeedbackMailto,
  buildFounderMailto,
  FOUNDER_EMAIL,
  type FeedbackTopic,
} from '@/utils/support-mailto';
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

  const versionLabel = appVersionLabel();
  const canSend = message.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;
    const mailto = buildFeedbackMailto({
      message,
      topic,
      profile: profile
        ? { firstName: profile.firstName, lastName: profile.lastName, email: profile.email }
        : undefined,
      version: appVersionRaw(),
      pageUrl: window.location.href,
    });
    window.location.href = mailto;
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

      <div className="proto-support-form">
        <p className="proto-support-form__label pds-inspector-label">Send a note</p>
        <div className="proto-appearance-segmented proto-support-form__topics" role="group" aria-label="Feedback type">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              className={`proto-appearance-segmented__btn${topic === t ? ' proto-appearance-segmented__btn--active' : ''}`}
              aria-pressed={topic === t}
              onClick={() => setTopic((current) => (current === t ? undefined : t))}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          className="proto-support-form__textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's on your mind?"
          rows={5}
        />
        <button
          type="button"
          className="proto-settings-btn"
          disabled={!canSend}
          onClick={handleSend}
        >
          Send
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
