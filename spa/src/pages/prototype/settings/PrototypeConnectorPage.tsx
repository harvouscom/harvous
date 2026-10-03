import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { isFeatureWithheld } from '@/lib/billing-plans';
import { getRelativeTime } from '@/utils/date-formatting';
import { useHasFeature } from '../../../hooks/useHasFeature';
import { useSubscriptionStatus } from '../../../hooks/queries/useSubscriptionStatus';
import { useConnectorStatus, type ConnectorClient } from '../../../hooks/queries/useConnectorStatus';
import { useConnectorClientAccess } from '../../../hooks/mutations/useConnectorClientAccess';
import {
  useCreateConnectorToken,
  useRevokeConnectorToken,
  type CreatedConnectorToken,
} from '../../../hooks/mutations/useConnectorToken';
import { connectorSetupMessage } from '../../../lib/connector-setup-copy';
import { connectorAppFromClientName } from '@/utils/connector-app-name';
import Icon from '@/components/react/Icon';
import { AiAppMark } from './ai-app-marks';
import { SettingsCopyRow, SettingsGroup, SettingsIntro, SettingsRow, SettingsShell, SettingsToggleRow } from './SettingsShell';
import { useSetAllowStartNotes } from '../../../hooks/mutations/useConnectorPreferences';

/**
 * Settings › Connector — the Connector, part of Harvous Plus.
 *
 * Web-only for now, like Reminders: native has no matching row yet.
 *
 * Built as a setup guide first: pick your app, follow its numbered steps (the first one opens
 * that app's settings), paste the URL. Once an app has connected, it is listed at the top with
 * a reversible Disconnect — Harvous's own per-app block, since Clerk has no API to revoke a
 * grant — so the page reads as status for people who are already set up.
 *
 * Grok has two doors: grok.com signs in like Claude, but Grok Bot only takes a URL and a fixed
 * header, so its tab can mint a personal token. Muse has no URL field at all — you ask Muse to
 * add the connector — so its tab hands you the message to send.
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

type AppKey = 'claude' | 'chatgpt' | 'grok' | 'muse';

type SetupStep = { label: string; sublabel?: string; href?: string };

/**
 * Per-app steps. The first step of Claude, ChatGPT and Grok opens that app's own settings in a
 * new tab, so nobody has to hunt for where custom connectors live. ChatGPT needs Developer mode
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
  grok: {
    label: 'Grok',
    steps: [
      {
        label: 'Open Grok’s connectors',
        sublabel: 'grok.com → Settings → Connectors',
        href: 'https://grok.com/connectors',
      },
      { label: 'New Connector → Custom', sublabel: 'Name it Harvous and paste your URL from above.' },
      { label: 'Connect and sign in', sublabel: 'Use your Harvous account, then allow access.' },
    ],
  },
  muse: {
    label: 'Muse',
    steps: [
      { label: 'Copy the setup message below', sublabel: 'Muse adds connectors when you ask it to.' },
      { label: 'Send it to Muse', sublabel: 'In a new chat, paste and send.' },
      { label: 'Sign in when Muse asks', sublabel: 'Use your Harvous account, then allow access.' },
    ],
  },
};

const APP_ORDER: AppKey[] = ['claude', 'chatgpt', 'grok', 'muse'];

const TRY_ASKING = [
  'What have I written on Romans 8?',
  'Help me prepare for my group this week.',
  'Trace the theme of grace through my notes.',
] as const;

/** Apps name themselves on connect ("Anthropic/ClaudeAI"); show the name people know. */
export function displayAppName(raw: string): string {
  const app = connectorAppFromClientName(raw);
  return app.slug === 'app' && app.name === 'an AI app' ? 'Unknown app' : app.name;
}

/** The setup tab a connected app covers, or null for any other app (Cursor, a token…). */
export function setupAppForClient(name: string): AppKey | null {
  const slug = connectorAppFromClientName(name).slug;
  return (APP_ORDER as readonly string[]).includes(slug) ? (slug as AppKey) : null;
}

/**
 * The setup tabs still worth showing: an app that is connected (and not disconnected) has
 * nothing left to set up, so its steps would only be noise above its own row.
 */
export function appsStillToSetUp(clients: readonly Pick<ConnectorClient, 'name' | 'disconnected'>[]): AppKey[] {
  const connected = new Set(
    clients.filter((c) => !c.disconnected).map((c) => setupAppForClient(c.name)).filter(Boolean),
  );
  return APP_ORDER.filter((app) => !connected.has(app));
}

/** The app's mark on its Connected row; a generic puzzle piece for apps without one. */
function ClientMark({ client }: { client: ConnectorClient }) {
  const app = setupAppForClient(client.name);
  return (
    <span className="proto-connector-client-mark" aria-hidden="true">
      {app ? <AiAppMark app={app} size={16} /> : <Icon name={client.clientId.startsWith('token:') ? 'key' : 'puzzle-piece'} size={14} />}
    </span>
  );
}

function StepNumber({ n }: { n: number }) {
  return <span className="proto-connector-step__num">{n}</span>;
}

function AppPicker({
  apps,
  value,
  onChange,
}: {
  apps: readonly AppKey[];
  value: AppKey;
  onChange: (app: AppKey) => void;
}) {
  const activeIndex = Math.max(0, apps.indexOf(value));
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        className="proto-appearance-segmented proto-seg-track"
        role="radiogroup"
        aria-label="Which app"
        style={{ '--proto-seg-count': apps.length, '--proto-seg-index': activeIndex } as CSSProperties}
      >
        {apps.map((app) => (
          <button
            key={app}
            type="button"
            role="radio"
            aria-checked={value === app}
            className={`proto-appearance-segmented__btn${value === app ? ' proto-appearance-segmented__btn--active' : ''}`}
            onClick={() => onChange(app)}
          >
            <span className="proto-connector-app-tab">
              <AiAppMark app={app} />
              {SETUP[app].label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function shortDate(iso: string): string {
  return getRelativeTime(new Date(iso)).toLowerCase();
}

/**
 * Grok Bot's door: a personal token, shown once. Creating a new one replaces the old one, so
 * "lost it" and "rotate it" are the same button.
 */
function GrokBotToken({
  mcpUrl,
  active,
}: {
  mcpUrl: string | undefined;
  active: { prefix: string; createdAt: string; lastUsedAt: string | null } | null;
}) {
  const create = useCreateConnectorToken();
  const revoke = useRevokeConnectorToken();
  const [fresh, setFresh] = useState<CreatedConnectorToken | null>(null);
  const busy = create.isPending || revoke.isPending;

  const onCreate = () => create.mutate(undefined, { onSuccess: (created) => setFresh(created) });
  const onRevoke = () => revoke.mutate(undefined, { onSuccess: () => setFresh(null) });

  return (
    <>
      <SectionLabel>Grok Bot</SectionLabel>
      <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 10px' }}>
        Grok Bot can&rsquo;t sign in, so it uses a personal token instead. In Grok Bot, open
        Settings → Plugins, add your URL from above, and add a header named Authorization with
        this value.
      </p>
      {fresh ? (
        <>
          <div style={{ marginBottom: 8 }}>
            <SettingsCopyRow value={`Bearer ${fresh.token}`} mono layout="field" copyLabel="Copy" />
          </div>
          <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 12px' }}>
            Copy it now — Harvous won&rsquo;t show it again. Anyone with it can read your study,
            so keep it private.
          </p>
        </>
      ) : null}
      <SettingsGroup>
        {active && !fresh ? (
          <SettingsRow
            label={`Token ${active.prefix}…`}
            sublabel={`Created ${shortDate(active.createdAt)}${
              active.lastUsedAt ? ` · last used ${shortDate(active.lastUsedAt)}` : ' · not used yet'
            }`}
            value="Revoke"
            trailing="none"
            disabled={busy}
            onClick={onRevoke}
          />
        ) : null}
        {fresh ? (
          <SettingsRow label="Revoke this token" trailing="none" disabled={busy} onClick={onRevoke} />
        ) : (
          <SettingsRow
            label={active ? 'Replace token' : 'Create a token'}
            sublabel={active ? 'The old one stops working.' : undefined}
            trailing="none"
            disabled={busy || !mcpUrl}
            onClick={onCreate}
          />
        )}
      </SettingsGroup>
    </>
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
  const setAllowStartNotes = useSetAllowStartNotes();
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
  const setupApps = appsStillToSetUp(clients);
  // The chosen tab, unless that app has since connected — then the first one still to set up.
  const activeApp: AppKey | null = setupApps.includes(app) ? app : (setupApps[0] ?? null);

  return (
    <SettingsShell>
      <SettingsIntro>
        Ask Claude, ChatGPT, or another AI app about your notes. They can&rsquo;t change or
        delete anything you&rsquo;ve written.
      </SettingsIntro>

      {/* The one setting that changes what apps may do, so it leads the page rather than
          trailing the setup guide. */}
      <SettingsGroup>
        <SettingsToggleRow
          label="Let AI apps start notes"
          sublabel="Pick up a chat about Scripture as a new note."
          checked={data?.preferences?.allowStartNotes ?? false}
          disabled={!data || setAllowStartNotes.isPending}
          onChange={(next) => setAllowStartNotes.mutate(next)}
        />
      </SettingsGroup>

      {hasClients ? (
        <>
          <SectionLabel>Connected AI apps</SectionLabel>
          <SettingsGroup>
            {clients.map((client) => (
              <SettingsRow
                key={client.clientId}
                leadingNode={<ClientMark client={client} />}
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

      <SectionLabel>{hasClients ? 'Connect another AI app' : 'Connect an AI app'}</SectionLabel>
      <div style={{ marginBottom: 12 }}>
        <SettingsCopyRow
          value={data?.mcpUrl ?? (isLoading ? 'Loading…' : '—')}
          mono
          layout="field"
          copyLabel="Copy URL"
          disabled={!data?.mcpUrl}
        />
      </div>
      {activeApp ? (
        <>
          <AppPicker apps={setupApps} value={activeApp} onChange={setApp} />
          <SettingsGroup>
            {SETUP[activeApp].steps.map((step, i) => (
              <SettingsRow
                key={`${activeApp}-${step.label}`}
                label={step.label}
                sublabel={step.sublabel}
                leadingNode={<StepNumber n={i + 1} />}
                trailing={step.href ? 'chevron' : 'none'}
                onClick={step.href ? () => window.open(step.href, '_blank', 'noopener,noreferrer') : undefined}
              />
            ))}
          </SettingsGroup>
          {activeApp === 'muse' && data?.mcpUrl ? (
            <div style={{ margin: '-8px 0 20px' }}>
              <SettingsCopyRow
                value="Setup message for Muse"
                copyValue={connectorSetupMessage(data.mcpUrl)}
                copyLabel="Copy message"
                layout="field"
              />
            </div>
          ) : null}
        </>
      ) : null}
      {/* Grok Bot's token lives under the Grok tab, but stays reachable to revoke once Grok is
          connected and its tab has gone. */}
      {activeApp === 'grok' || (!setupApps.includes('grok') && data?.token) ? (
        <GrokBotToken mcpUrl={data?.mcpUrl} active={data?.token ?? null} />
      ) : null}
      <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '-8px 0 20px' }}>
        Other AI apps — Cursor, Claude Code, and most that support MCP — can add your URL as a remote
        server and sign in the same way.
      </p>
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
        AI apps can read your study, and start a new note if you allow it. They can&rsquo;t change or
        delete anything.
        Locked notes stay locked, and Scripture is shared as references only.
      </p>
    </SettingsShell>
  );
}
