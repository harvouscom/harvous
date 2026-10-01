import type { ReactNode } from 'react';
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
 * Three things only: the URL to paste, which apps have used it (with a reversible
 * Disconnect), and today's usage. Disconnect is Harvous's own per-app block — Clerk has
 * no API to revoke a grant — so it is reversible and needs no confirmation step.
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

const SETUP_STEPS = [
  { label: 'Claude', sublabel: 'Settings → Connectors → Add custom connector, then paste the URL.' },
  { label: 'ChatGPT', sublabel: 'Add it as a custom connector in Settings → Apps & Connectors.' },
  { label: 'Cursor and others', sublabel: 'Add it as a remote MCP server. Sign in when asked.' },
] as const;

function clientSublabel(client: ConnectorClient): string {
  if (client.disconnected) return 'Disconnected — it can no longer read your study';
  return `Last used ${getRelativeTime(new Date(client.lastUsedAt)).toLowerCase()}`;
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

  return (
    <SettingsShell>
      <SettingsIntro>
        Ask Claude, ChatGPT, or another AI app about your notes. They can read your study; they
        can&rsquo;t change it.
      </SettingsIntro>

      <SectionLabel>Connector URL</SectionLabel>
      <div style={{ marginBottom: 20 }}>
        <SettingsCopyRow
          value={data?.mcpUrl ?? (isLoading ? 'Loading…' : '—')}
          mono
          layout="field"
          disabled={!data?.mcpUrl}
        />
      </div>

      <SectionLabel>How to connect</SectionLabel>
      <SettingsGroup>
        {SETUP_STEPS.map((step) => (
          <SettingsRow key={step.label} label={step.label} sublabel={step.sublabel} trailing="none" />
        ))}
      </SettingsGroup>

      <SectionLabel>Connected apps</SectionLabel>
      <SettingsGroup>
        {isError ? (
          <SettingsRow label="Couldn’t load your apps" sublabel="Try again in a moment." trailing="none" />
        ) : !data ? (
          <SettingsRow label="Loading…" trailing="none" />
        ) : data.clients.length === 0 ? (
          <SettingsRow label="No apps yet" sublabel="Apps appear here after they first connect." trailing="none" />
        ) : (
          data.clients.map((client) => (
            <SettingsRow
              key={client.clientId}
              label={client.name}
              sublabel={clientSublabel(client)}
              value={client.disconnected ? 'Allow again' : 'Disconnect'}
              trailing="none"
              disabled={access.isPending}
              onClick={() =>
                access.mutate({ clientId: client.clientId, disconnected: !client.disconnected })
              }
            />
          ))
        )}
      </SettingsGroup>

      {data ? (
        <SettingsGroup>
          <SettingsRow
            label="Today"
            value={`${data.usage.today.toLocaleString('en-US')} of ${data.usage.dailyLimit.toLocaleString('en-US')} requests`}
            trailing="none"
          />
        </SettingsGroup>
      ) : null}

      <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '4px 0 0' }}>
        Read-only. Apps can&rsquo;t add, edit, or delete anything. Locked notes stay locked, and
        Scripture is shared as references only.
      </p>
    </SettingsShell>
  );
}
