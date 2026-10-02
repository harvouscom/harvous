import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { isFeatureWithheld } from '@/lib/billing-plans';
import { getRelativeTime } from '@/utils/date-formatting';
import { useHasFeature } from '../../../hooks/useHasFeature';
import { useSubscriptionStatus } from '../../../hooks/queries/useSubscriptionStatus';
import { useConnectorStatus, type ConnectorClient } from '../../../hooks/queries/useConnectorStatus';
import { useConnectorClientAccess } from '../../../hooks/mutations/useConnectorClientAccess';
import { SettingsCopyRow, SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from './SettingsShell';

/**
 * Settings › Claude & ChatGPT — the Connector, part of Harvous Plus.
 *
 * Web-only for now, like Reminders: native has no matching row yet.
 *
 * Built as a setup guide first: pick your app, follow its numbered steps (the first one opens
 * that app's settings), paste the URL. Once an app has connected, it is listed at the top with
 * a reversible Disconnect — Harvous's own per-app block, since Clerk has no API to revoke a
 * grant — so the page reads as status for people who are already set up.
 */

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="pds-inspector-label"
      style={{ padding: '0 0 6px', textTransform: 'uppercase', color: 'var(--pds-text-tertiary)' }}
    >
      {children}
    </div>
  );
}

type AppKey = 'claude' | 'chatgpt' | 'other';

type SetupStep = { label: string; sublabel?: string; href?: string };

/**
 * Per-app steps. The first step of Claude and ChatGPT opens that app's own settings in a new
 * tab, so nobody has to hunt for where custom connectors live. ChatGPT needs Developer mode
 * and an explicit OAuth choice to add a custom connector; Claude needs neither.
 */
const SETUP: Record<AppKey, { label: string; steps: SetupStep[] }> = {
  claude: {
    label: 'Claude',
    steps: [
      {
        label: 'Open Claude’s connector settings',
        sublabel: 'claude.ai → Settings → Connectors',
        href: 'https://claude.ai/settings/connectors',
      },
      { label: 'Add custom connector', sublabel: 'Name it Harvous and paste your URL from above.' },
      { label: 'Connect and sign in', sublabel: 'Use your Harvous account, then allow access.' },
    ],
  },
  chatgpt: {
    label: 'ChatGPT',
    steps: [
      {
        label: 'Open ChatGPT’s settings',
        sublabel: 'chatgpt.com → Settings → Apps & Connectors',
        href: 'https://chatgpt.com/#settings/Connectors',
      },
      { label: 'Turn on Developer mode', sublabel: 'Under Advanced. ChatGPT needs it to add your own connector.' },
      { label: 'Create a connector', sublabel: 'Name it Harvous, paste your URL from above, and choose OAuth.' },
      { label: 'Sign in', sublabel: 'Use your Harvous account, then allow access.' },
    ],
  },
  other: {
    label: 'Other apps',
    steps: [
      {
        label: 'Add a remote MCP server',
        sublabel: 'Cursor, Claude Code and most AI apps that support MCP can add one by URL.',
      },
      { label: 'Paste your URL from above', sublabel: 'Choose Streamable HTTP if asked.' },
      { label: 'Sign in when prompted', sublabel: 'Use your Harvous account.' },
    ],
  },
};

const APP_ORDER: AppKey[] = ['claude', 'chatgpt', 'other'];

const TRY_ASKING = [
  'What have I written on Romans 8?',
  'Help me prepare for my group this week.',
  'Trace the theme of grace through my notes.',
] as const;

/** Apps name themselves on connect ("Anthropic/ClaudeAI"); show the name people know. */
export function displayAppName(raw: string): string {
  const name = raw.trim();
  if (/claude/i.test(name)) return 'Claude';
  if (/chatgpt|openai/i.test(name)) return 'ChatGPT';
  if (/cursor/i.test(name)) return 'Cursor';
  const last = name.split('/').pop()?.trim();
  return last || 'Unknown app';
}

function StepNumber({ n }: { n: number }) {
  return <span className="proto-connector-step__num">{n}</span>;
}

function AppPicker({ value, onChange }: { value: AppKey; onChange: (app: AppKey) => void }) {
  const activeIndex = Math.max(0, APP_ORDER.indexOf(value));
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        className="proto-appearance-segmented proto-seg-track"
        role="radiogroup"
        aria-label="Which app"
        style={{ '--proto-seg-count': APP_ORDER.length, '--proto-seg-index': activeIndex } as CSSProperties}
      >
        {APP_ORDER.map((app) => (
          <button
            key={app}
            type="button"
            role="radio"
            aria-checked={value === app}
            className={`proto-appearance-segmented__btn${value === app ? ' proto-appearance-segmented__btn--active' : ''}`}
            onClick={() => onChange(app)}
          >
            {SETUP[app].label}
          </button>
        ))}
      </div>
    </div>
  );
}

function clientSublabel(client: ConnectorClient): string {
  if (client.disconnected) return 'Disconnected — it can no longer read your study';
  return `Connected · last used ${getRelativeTime(new Date(client.lastUsedAt)).toLowerCase()}`;
}

export default function PrototypeConnectorPage() {
  const navigate = useNavigate();
  const connector = useHasFeature('connector');
  // While `connector` is withheld the client answers "no" for everyone, but preview accounts
  // (CONNECTOR_PREVIEW_USER_IDS) are let through by the server — so during the preview the
  // page asks the server and trusts its answer. After launch, only Plus holders ask.
  const preview = isFeatureWithheld('connector');
  const { data, isLoading, isError, isFetched } = useConnectorStatus(connector.has || preview);
  const access = useConnectorClientAccess();
  const [app, setApp] = useState<AppKey>('claude');
  const allowed = connector.has || (preview && Boolean(data));
  // Plus already includes this — someone holding Plus during the preview is early, not unpaid.
  const { data: subscription } = useSubscriptionStatus();
  const hasPlus = Boolean(subscription?.hasSharedSpaces);

  if (!connector.ready || (preview && !isFetched)) return <SettingsShell>{null}</SettingsShell>;

  if (!allowed && hasPlus) {
    return (
      <SettingsShell>
        <SettingsIntro>
          Using your study in Claude, ChatGPT, and other AI apps is coming to Harvous Plus soon.
          It&rsquo;s already part of your plan.
        </SettingsIntro>
      </SettingsShell>
    );
  }

  if (!allowed) {
    return (
      <SettingsShell>
        <SettingsIntro>
          Use your study in Claude, ChatGPT, and other AI apps. Part of Harvous Plus.
        </SettingsIntro>
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--primary"
          onClick={() => navigate({ to: '/upgrade' })}
        >
          Get Harvous Plus
        </button>
      </SettingsShell>
    );
  }

  const clients = data?.clients ?? [];
  const hasClients = clients.length > 0;

  return (
    <SettingsShell>
      <SettingsIntro>
        Ask Claude, ChatGPT, or another AI app about your notes. They can read your study; they
        can&rsquo;t change it.
      </SettingsIntro>

      {hasClients ? (
        <>
          <SectionLabel>Connected apps</SectionLabel>
          <SettingsGroup>
            {clients.map((client) => (
              <SettingsRow
                key={client.clientId}
                label={displayAppName(client.name)}
                sublabel={clientSublabel(client)}
                value={client.disconnected ? 'Allow again' : 'Disconnect'}
                trailing="none"
                disabled={access.isPending}
                onClick={() => access.mutate({ clientId: client.clientId, disconnected: !client.disconnected })}
              />
            ))}
          </SettingsGroup>
          {data && data.usage.today > 0 ? (
            <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '-8px 0 20px' }}>
              {data.usage.today.toLocaleString('en-US')} of {data.usage.dailyLimit.toLocaleString('en-US')} requests
              today
            </p>
          ) : null}
        </>
      ) : null}

      <SectionLabel>{hasClients ? 'Connect another app' : 'Connect an app'}</SectionLabel>
      <div style={{ marginBottom: 12 }}>
        <SettingsCopyRow
          value={data?.mcpUrl ?? (isLoading ? 'Loading…' : '—')}
          mono
          layout="field"
          copyLabel="Copy URL"
          disabled={!data?.mcpUrl}
        />
      </div>
      <AppPicker value={app} onChange={setApp} />
      <SettingsGroup>
        {SETUP[app].steps.map((step, i) => (
          <SettingsRow
            key={`${app}-${step.label}`}
            label={step.label}
            sublabel={step.sublabel}
            leadingNode={<StepNumber n={i + 1} />}
            trailing={step.href ? 'chevron' : 'none'}
            onClick={step.href ? () => window.open(step.href, '_blank', 'noopener,noreferrer') : undefined}
          />
        ))}
      </SettingsGroup>
      {isError ? (
        <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '-8px 0 16px' }}>
          Couldn&rsquo;t load your connected apps. Try again in a moment.
        </p>
      ) : null}

      <SectionLabel>Then try asking</SectionLabel>
      <SettingsGroup>
        {TRY_ASKING.map((question) => (
          <SettingsRow key={question} label={`“${question}”`} trailing="none" />
        ))}
      </SettingsGroup>
      <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '-8px 0 20px' }}>
        In Claude, Harvous also adds ready-made prompts to the + menu.
      </p>

      <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '4px 0 0' }}>
        Read-only. Apps can&rsquo;t add, edit, or delete anything. Locked notes stay locked, and
        Scripture is shared as references only.
      </p>
    </SettingsShell>
  );
}
