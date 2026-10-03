/**
 * Dev-only preview of "start a note from this chat" (Connector `start_note`).
 * Open http://localhost:<port>/__dev/connector-design while `npm run dev` runs.
 *
 * Left: the chat, mocked. Right: the note Harvous would create — the real
 * PrototypeChatOriginCard over an empty page. Fixture data only; nothing is written.
 */
import { useState } from 'react';
import '../../styles/prototype-shell.css';
import '../../styles/prototype-components.css';
import '../../styles/prototype-editor.css';
import Icon from '@/components/react/Icon';
import PrototypeChatOriginCard, { type ChatOrigin } from '../prototype/PrototypeChatOriginCard';

const ROMANS: ChatOrigin = {
  appName: 'Claude',
  summary:
    'You asked whether Romans 8:28 covers trouble you brought on yourself. We looked at who the promise is addressed to (“those who love God… called according to his purpose”), Joseph’s words to his brothers, and Paul’s weakness. One reading we talked through: God bringing good out of what was not good, without calling the harm good — though Christians weigh this verse differently.',
  passages: ['Romans 8:28-29', 'Genesis 50:20', '2 Corinthians 12:9'],
  question: 'How does verse 29 shape what “for good” means here?',
  createdAt: '2026-10-02T15:00:00Z',
};

const VARIANTS: { title: string; noteTitle: string; origin: ChatOrigin }[] = [
  {
    title: 'ChatGPT · no open question',
    noteTitle: 'Good Samaritan — group prep',
    origin: {
      appName: 'ChatGPT',
      summary:
        'Prep for Thursday’s group on the Good Samaritan: the lawyer’s question, why a Samaritan, and three discussion questions to open with.',
      passages: ['Luke 10:25-37', 'Leviticus 19:18'],
      createdAt: '2026-10-02T15:00:00Z',
    },
  },
  {
    title: 'Grok · one passage',
    noteTitle: 'Abide',
    origin: {
      appName: 'Grok',
      summary: 'A quick look at what “abide” means in John 15 and how it ties to the vine image.',
      passages: ['John 15:1-11'],
      question: 'What does abiding look like on an ordinary Tuesday?',
      createdAt: '2026-10-02T15:00:00Z',
    },
  },
];

function Bubble({ who, children }: { who: 'you' | 'ai'; children: React.ReactNode }) {
  return <div className={`dev-chat__bubble dev-chat__bubble--${who}`}>{children}</div>;
}

function ChatMock({ allowed, onAllow }: { allowed: boolean; onAllow: () => void }) {
  return (
    <div className="dev-chat">
      <p className="pds-caption dev-col-label">In Claude (mocked)</p>
      <Bubble who="you">
        I keep coming back to Romans 8:28. Does “all things work together for good” include the mess I made
        myself?
      </Bubble>
      <Bubble who="ai">
        It’s a fair question. Paul’s promise is to “those who love God,” and verse 29 says what the good is:
        being conformed to the image of his Son. Joseph says something similar in Genesis 50:20… (and so on)
      </Bubble>
      <Bubble who="ai">Want me to start a Harvous note from this, so you can keep writing about it there?</Bubble>
      <Bubble who="you">Yes please.</Bubble>
      <div className="dev-chat__tool">
        <p className="pds-caption dev-chat__tool-head">Harvous · start_note</p>
        <p className="dev-chat__tool-body">
          Start a note “Romans 8:28 and my own mess” with a summary, 3 passages and an open question.
        </p>
        {allowed ? (
          <p className="pds-caption dev-chat__tool-done">Allowed</p>
        ) : (
          <div className="dev-chat__tool-actions">
            <button type="button" className="proto-settings-btn" onClick={onAllow}>
              Allow once
            </button>
          </div>
        )}
      </div>
      {allowed ? (
        <Bubble who="ai">
          Done — I started <strong>Romans 8:28 and my own mess</strong> in Harvous. The page is empty for your
          own words; my summary is in a card at the top. <span className="dev-chat__link">Open in Harvous ↗</span>
        </Bubble>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="proto-inspector-row">
      <span className="proto-inspector-row-label">{label}</span>
      <span className="proto-inspector-row-value">{children}</span>
    </div>
  );
}

/** The side panel's Info section as it would read for a note started from a chat. */
function InspectorMock({ appName, edited }: { appName: string; edited: boolean }) {
  return (
    <div className="proto-inspector dev-inspector">
      <section className="proto-inspector-section">
        <p className="pds-caption dev-col-label">Info</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row label="Created">Oct 2, 2026, 10:00 AM</Row>
          <Row label="Added by">You</Row>
          <Row label="Started in">
            <span className="dev-inspector__app">
              <Icon name="puzzle-piece" size={11} aria-hidden />
              {appName}
            </span>
          </Row>
          <Row label="Edited">{edited ? 'Oct 2, 2026, 10:14 AM' : 'Never'}</Row>
          <Row label="Words">{edited ? '212' : '0'}</Row>
        </div>
      </section>
    </div>
  );
}

function NotePaper({ title, origin, removable }: { title: string; origin: ChatOrigin | null; removable?: boolean }) {
  const [card, setCard] = useState(origin);
  return (
    <div className="dev-paper">
      <p className="pds-caption dev-paper__meta">My Home · Oct 2 · Started in {origin?.appName ?? 'Claude'}</p>
      <h1 className="dev-paper__title">{title}</h1>
      {card ? (
        <PrototypeChatOriginCard
          origin={card}
          onOpenPassage={(ref) => window.alert(`Opens ${ref} in the reader`)}
          onRemove={removable ? () => setCard(null) : undefined}
        />
      ) : null}
      <p className="dev-paper__placeholder">
        <span className="dev-paper__caret" aria-hidden />
        Start writing…
      </p>
    </div>
  );
}

export default function ConnectorDesignPage() {
  const [allowed, setAllowed] = useState(false);
  return (
    <div className="proto-theme dev-connector">
      <style>{DEV_CSS}</style>
      <header className="dev-connector__header">
        <h1 className="pds-list-title">Start a note from a chat</h1>
        <p className="pds-caption">
          Dev preview of the Connector’s one write. Fixture data; nothing is saved. Card:{' '}
          <code>spa/src/pages/prototype/PrototypeChatOriginCard.tsx</code>
        </p>
      </header>

      <section className="dev-connector__flow">
        <ChatMock allowed={allowed} onAllow={() => setAllowed(true)} />
        <div>
          <p className="pds-caption dev-col-label">In Harvous</p>
          {allowed ? (
            <div className="dev-note-with-panel">
              <NotePaper title="Romans 8:28 and my own mess" origin={ROMANS} removable />
              <InspectorMock appName="Claude" edited={false} />
            </div>
          ) : (
            <div className="dev-paper dev-paper--empty pds-caption">Allow the tool call to see the note.</div>
          )}
        </div>
      </section>

      <h2 className="pds-caption dev-col-label" style={{ marginTop: 40 }}>Other apps</h2>
      <section className="dev-connector__variants">
        {VARIANTS.map((v) => (
          <div key={v.title}>
            <p className="pds-caption dev-col-label">{v.title}</p>
            <NotePaper title={v.noteTitle} origin={v.origin} removable />
          </div>
        ))}
      </section>
    </div>
  );
}

const DEV_CSS = `
.dev-connector { min-height: 100vh; padding: 48px 24px 64px; background: var(--pds-bg-page); color: var(--pds-text-primary); box-sizing: border-box; }
.dev-connector__header { max-width: 1280px; margin: 0 auto 24px; }
.dev-connector__flow, .dev-connector__variants { max-width: 1280px; margin: 0 auto; display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); align-items: start; }
.dev-col-label { color: var(--pds-text-tertiary); margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }
.dev-connector__flow { grid-template-columns: minmax(300px, 0.75fr) minmax(0, 1.5fr); }
@media (max-width: 900px) { .dev-connector__flow, .dev-note-with-panel { grid-template-columns: 1fr !important; } }
.dev-note-with-panel { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 16px; align-items: start; }
.dev-inspector { padding: 12px 14px; border-radius: 12px; background: var(--pds-bg-chip); }
.dev-inspector__app { display: inline-flex; align-items: center; gap: 5px; }
.dev-chat { display: flex; flex-direction: column; gap: 10px; }
.dev-chat__bubble { padding: 10px 14px; border-radius: 14px; font-size: 15px; line-height: 1.45; max-width: 90%; }
.dev-chat__bubble--you { align-self: flex-end; background: var(--pds-bg-chip); }
.dev-chat__bubble--ai { align-self: flex-start; background: transparent; padding-left: 0; }
.dev-chat__tool { border: 0.5px solid var(--pds-paper-rule); border-radius: 12px; padding: 10px 14px; background: var(--pds-paper-sheet); }
.dev-chat__tool-head { color: var(--pds-text-tertiary); margin: 0 0 4px; }
.dev-chat__tool-body { margin: 0; font-size: 14px; }
.dev-chat__tool-actions { margin-top: 10px; }
.dev-chat__tool-done { margin: 6px 0 0; color: var(--pds-text-tertiary); }
.dev-chat__link { text-decoration: underline; }
.dev-paper { background: var(--pds-paper-sheet); border: 0.5px solid var(--pds-paper-rule); border-radius: 2px; box-shadow: 0 8px 24px -12px rgba(20,18,12,.1); padding: 28px 28px 48px; min-height: 360px; }
.dev-paper--empty { display: grid; place-items: center; color: var(--pds-text-tertiary); }
.dev-paper__meta { color: var(--pds-text-tertiary); margin: 0 0 6px; }
.dev-paper__title { font-size: 26px; line-height: 1.2; font-weight: 600; margin: 0 0 18px; }
.dev-paper__placeholder { color: var(--pds-text-tertiary); font-size: 17px; margin: 0; display: flex; align-items: center; gap: 2px; }
.dev-paper__caret { display: inline-block; width: 1.5px; height: 1.1em; background: var(--pds-text-primary); animation: dev-blink 1.1s steps(1) infinite; }
@keyframes dev-blink { 50% { opacity: 0; } }
`;
