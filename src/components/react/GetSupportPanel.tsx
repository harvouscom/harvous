import React, { useState } from 'react';
import '@/styles/scripture-pill-chrome.css';
import Icon from './Icon';
import SquareButton from './SquareButton';
import { toast } from '@/utils/toast';
import {
  buildFeedbackMailto,
  buildFounderMailto,
  FOUNDER_EMAIL,
  type FeedbackTopic,
} from '@/utils/support-mailto';
import { useProfile } from '../../../spa/src/hooks/queries/useProfile';

interface GetSupportPanelProps {
  onClose?: () => void;
  version?: string;
  inBottomSheet?: boolean;
}

const TOPICS: FeedbackTopic[] = ['Bug', 'Idea', 'Question'];

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 14px',
  border: '0.5px solid var(--color-border, rgba(0,0,0,0.12))',
  borderRadius: 12,
  background: 'var(--color-bg-subtle, rgba(0,0,0,0.04))',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.9375rem',
  lineHeight: 1.45,
  color: 'var(--color-deep-grey)',
  resize: 'vertical',
  minHeight: 120,
  outline: 'none',
};

export default function GetSupportPanel({
  onClose,
  version,
  inBottomSheet = false,
}: GetSupportPanelProps) {
  const { data: profile } = useProfile();
  const displayVersion =
    version || (typeof window !== 'undefined' && (window as { __APP_VERSION__?: string }).__APP_VERSION__) || 'Unknown';

  const [emailCopied, setEmailCopied] = useState(false);
  const [topic, setTopic] = useState<FeedbackTopic | undefined>();
  const [message, setMessage] = useState('');

  const canSend = message.trim().length > 0;

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(FOUNDER_EMAIL);
      setEmailCopied(true);
      window.setTimeout(() => setEmailCopied(false), 1400);
    } catch {
      toast.error('Could not copy email');
    }
  };

  const handleSend = () => {
    if (!canSend) return;
    window.location.href = buildFeedbackMailto({
      message,
      topic,
      profile: profile
        ? { firstName: profile.firstName, lastName: profile.lastName, email: profile.email }
        : undefined,
      version: displayVersion !== 'Unknown' ? displayVersion : undefined,
      pageUrl: window.location.href,
    });
  };

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <div className={inBottomSheet ? 'flex-fill flex-stack' : 'flex-stack'} style={{ gap: 0 }}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          <div className="panel__header">
            <div className="panel__title">
              <p>Get Support</p>
            </div>
          </div>

          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
              <div className="panel__content-scroll">
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20, padding: '0 4px', minWidth: 0 }}>
                  <picture style={{ flexShrink: 0, width: 52, height: 52, lineHeight: 0 }}>
                    <source srcSet="/derek-avatar.webp" type="image/webp" />
                    <img
                      src="/derek-avatar.jpeg"
                      alt="Derek Castelli"
                      width={52}
                      height={52}
                      decoding="async"
                      fetchPriority="high"
                      style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                    />
                  </picture>
                  <div style={{ minWidth: 0, flex: '1 1 0' }}>
                    <p style={{ margin: '0 0 8px', fontSize: '0.9375rem', lineHeight: 1.45, color: 'var(--color-medium-grey)', overflowWrap: 'anywhere' }}>
                      I&apos;m Derek, the founder. Questions, bugs, ideas — I read everything myself. Let me know how I can help.
                    </p>
                    <p style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-deep-grey)' }}>Derek Castelli</span>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--color-medium-grey)' }}>Founder of Harvous</span>
                    </p>
                  </div>
                </div>

                <div
                  className="space-button relative rounded-3xl cursor-default pl-4 w-full"
                  style={{ backgroundImage: 'var(--color-gradient-gray)', paddingRight: 8, minHeight: 56, marginBottom: 16 }}
                >
                  <div className="panel__list-item" style={{ padding: '8px 0', flexWrap: 'wrap', minWidth: 0 }}>
                    <div className="panel__list-item-text" style={{ minWidth: 0, flex: '1 1 12rem' }}>
                      <a
                        href={buildFounderMailto()}
                        className="panel__list-item-label"
                        style={{ textDecoration: 'none', color: 'inherit', overflowWrap: 'anywhere' }}
                      >
                        {FOUNDER_EMAIL}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      aria-label={emailCopied ? 'Email copied' : 'Copy email address'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 10px',
                        border: '0.5px solid var(--color-border, rgba(0,0,0,0.12))',
                        borderRadius: 999,
                        background: 'var(--color-bg, #fff)',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {emailCopied ? (
                        <>
                          <Icon name="check" size={14} aria-hidden />
                          Copied
                        </>
                      ) : (
                        <>
                          <Icon name="copy" size={14} aria-hidden />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div style={{ padding: '0 4px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-medium-grey)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Send a note
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      borderRadius: 9,
                      background: 'var(--pds-bg-control, rgba(0,0,0,0.06))',
                      padding: 3,
                      gap: 2,
                      marginBottom: 12,
                    }}
                    role="group"
                    aria-label="Feedback type"
                  >
                    {TOPICS.map((t) => {
                      const isActive = topic === t;
                      return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setTopic((current) => (current === t ? undefined : t))}
                        style={{
                          flex: 1,
                          border: 'none',
                          borderRadius: 7,
                          padding: '5px 12px',
                          background: isActive ? 'var(--pds-bg-page, #fff)' : 'transparent',
                          fontSize: '0.8125rem',
                          fontWeight: isActive ? 600 : 500,
                          color: isActive
                            ? 'var(--pds-text-primary, var(--color-deep-grey))'
                            : 'var(--color-medium-grey)',
                          cursor: 'pointer',
                          boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        }}
                      >
                        {t}
                      </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What's on your mind?"
                    rows={5}
                    style={{ ...inputStyle, marginBottom: 12 }}
                  />
                  <button
                    type="button"
                    disabled={!canSend}
                    onClick={handleSend}
                    className="space-button relative rounded-3xl h-[48px] cursor-pointer transition-[scale,shadow] duration-200 w-full"
                    style={{
                      backgroundImage: 'var(--color-gradient-gray)',
                      opacity: canSend ? 1 : 0.5,
                      cursor: canSend ? 'pointer' : 'not-allowed',
                      border: 'none',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: 'var(--color-deep-grey)',
                    }}
                  >
                    Send
                  </button>
                </div>

                <footer className="scripture-pill-chrome__attribution" style={{ marginTop: 24 }}>
                  <Icon name="circle-info" size={9} className="scripture-pill-chrome__attribution-icon" aria-hidden />
                  <p className="scripture-pill-chrome__attribution-copyright">Version {displayVersion}</p>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel__footer--buttons">
        <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
      </div>
    </div>
  );
}
