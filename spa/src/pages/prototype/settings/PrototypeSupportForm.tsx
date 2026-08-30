import { RELEASE_NOTES_INDEX_URL } from '@/utils/release-notes-url';
import { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/react/Icon';
import { buildFounderMailto, FOUNDER_EMAIL, type FeedbackTopic } from '@/utils/support-mailto';
import { collectSupportClientContext } from '@/utils/support-client-context';
import { submitSupportTicket } from '@/utils/support-tickets';
import { SettingsCopyRow, SettingsGroup } from './SettingsShell';

const TOPICS: FeedbackTopic[] = ['Bug', 'Idea', 'Question'];

function appVersionRaw(): string | undefined {
  return (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__;
}



type Props = {
  initialTopic?: FeedbackTopic;
};

export default function PrototypeSupportForm({ initialTopic }: Props) {
  const [topic, setTopic] = useState<FeedbackTopic | undefined>(initialTopic);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const version = appVersionRaw();
  const versionLabel = version ? `Version ${version}` : '';
  const canSend = message.trim().length > 0 && !pending;

  const handleSend = async () => {
    if (!canSend) return;
    setPending(true);
    try {
      await submitSupportTicket({
        message,
        topic,
        appVersion: appVersionRaw(),
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
    <>
      <div className="proto-support-founder">
        <picture>
          <source srcSet="/derek-avatar.webp" type="image/webp" />
          <img
            src="/derek-avatar.jpeg"
            alt="Derek Castelli"
            className="proto-support-founder__avatar"
            width={52}
            height={52}
            decoding="async"
            fetchPriority="high"
          />
        </picture>
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
          Your note was sent. I&apos;ll get back to you at {FOUNDER_EMAIL}.
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
        <button type="button" className="proto-settings-btn" disabled={!canSend} onClick={() => void handleSend()}>
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {/*
        * The link goes to the index, not to this version's own page.
        *
        * The site publishes a page per release, so `/release-notes/v2-96-1/` looks like the
        * better destination and would be, if it existed. It routinely does not: the app's
        * version bumps on every commit, so a build is regularly ahead of what has been
        * published — checked live, that exact URL was a 404 while the newest published page
        * was `v2-87-2`. This sits in the support pane, where people arrive because something
        * is already wrong, which is the worst place in the app to hand somebody a second
        * broken thing.
        *
        * The version still prints beside it. That is the part support actually needs, and it
        * is now the only part that depends on knowing the version — the footer used to hide
        * itself entirely without one, taking a working link with it.
        */}
      <footer className="proto-support-version">
        {versionLabel ? <p className="proto-support-version__label">{versionLabel}</p> : null}
        <a
          className="proto-support-version__link"
          href={RELEASE_NOTES_INDEX_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Release notes
          <Icon name="arrow-up-right-from-square" size={10} aria-hidden />
        </a>
      </footer>
    </>
  );
}
