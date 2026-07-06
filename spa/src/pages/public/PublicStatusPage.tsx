import { useAuth } from '@clerk/clerk-react';
import { useLayoutEffect } from 'react';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { prototypeHref } from '@/lib/prototype-path';
import { FOUNDER_EMAIL } from '@/utils/support-mailto';
import { clearPrototypeRouteBoot } from '../../lib/prototype-background';
import { usePublicStatus, type AggregateState, type ResourceStatus } from '../../hooks/queries/usePublicStatus';
import { PublicTopBar, PublicErrorState } from './public-shared';

const AGGREGATE_LABELS: Record<AggregateState, string> = {
  operational: "Everything's working",
  degraded: "Something's running slow",
  downtime: "We're having trouble right now",
  maintenance: "We're doing a little upkeep",
};

const RESOURCE_LABELS: Record<ResourceStatus, string> = {
  operational: 'All good',
  degraded: 'Slow',
  downtime: 'Down',
  maintenance: 'Maintenance',
  not_monitored: 'Not watched',
};

const STATUS_ACCENT: Record<ResourceStatus | AggregateState, string> = {
  operational: 'var(--color-skyBlue)',
  degraded: 'var(--color-warmAmber)',
  downtime: 'var(--color-coralRose)',
  maintenance: 'var(--color-blue)',
  not_monitored: 'var(--color-paper)',
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatUptime(availability: number | null): string {
  if (availability == null || Number.isNaN(availability)) return '—';
  const value = availability <= 1 ? availability * 100 : availability;
  return `${value.toFixed(2)}%`;
}

function hasResources(sections: { resources: unknown[] }[]): boolean {
  return sections.some((s) => s.resources.length > 0);
}

function statusBadgeClass(status: ResourceStatus | AggregateState): string {
  return `public-status-badge public-status-badge--${status}`;
}

const SUPPORT_MAILTO = `mailto:${FOUNDER_EMAIL}?subject=${encodeURIComponent('Harvous support')}`;

export default function PublicStatusPage() {
  const { isSignedIn } = useAuth();
  const { data, isLoading, error } = usePublicStatus();

  useLayoutEffect(() => {
    clearPrototypeRouteBoot();
  }, []);

  const aggregateState = data?.aggregateState ?? 'operational';
  const aggregateLabel = AGGREGATE_LABELS[aggregateState];

  return (
    <>
      <title>Harvous Status</title>
      <div className="public-page">
        <PublicTopBar isSignedIn={!!isSignedIn} />

        <div className="public-body">
          <div className="public-content public-content--status">
            {isLoading ? (
              <div className="page-loading" />
            ) : error || !data ? (
              <PublicErrorState
                title="Can't load status right now"
                message={
                  error instanceof Error && error.message
                    ? error.message
                    : "Hmm, we couldn't fetch the latest status. Give it a moment and try again?"
                }
                showFooter={false}
              />
            ) : (
              <SubtleContentMount variant="fade" className="public-status-mount">
                <>
                  <p className="public-creator">Harvous Status</p>

                  <div className="public-paper-stack public-paper-stack--status">
                    <div className="public-paper-stack__leaf public-paper-stack__leaf--back" aria-hidden />
                    <div className="public-paper-stack__leaf public-paper-stack__leaf--mid" aria-hidden />

                    <article className="public-status-sheet">
                      <header className="public-status-sheet__header">
                        <h1 className="public-status-sheet__title">{aggregateLabel}</h1>
                        <p className="public-status-sheet__meta">
                          Last updated {formatRelativeTime(data.updatedAt)}
                        </p>
                      </header>

                      {data.announcement && (
                        <p className="public-status-sheet__announcement">{data.announcement}</p>
                      )}

                      <div className="public-status-sheet__body">
                        {!hasResources(data.sections) ? (
                          <p className="public-status-sheet__empty">
                            We're still setting up what shows here. The headline above is the best picture we have for now.
                          </p>
                        ) : (
                          data.sections.map((section) =>
                            section.resources.length === 0 ? null : (
                              <section key={section.id} className="public-status-sheet__section">
                                {data.sections.length > 1 && (
                                  <h2 className="public-status-sheet__section-title">{section.name}</h2>
                                )}
                                <div className={`public-status-table-wrap public-status-table-wrap--${aggregateState}`}>
                                  <table className="public-status-table">
                                    <thead>
                                      <tr>
                                        <th scope="col">Service</th>
                                        <th scope="col">Uptime</th>
                                        <th scope="col">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {section.resources.map((resource) => (
                                        <tr key={resource.id}>
                                          <td className="public-status-table__service">
                                            <span className="public-status-table__name">{resource.name}</span>
                                            {resource.explanation && (
                                              <span className="public-status-table__detail">
                                                {resource.explanation}
                                              </span>
                                            )}
                                          </td>
                                          <td className="public-status-table__uptime">
                                            {formatUptime(resource.availability)}
                                          </td>
                                          <td className="public-status-table__status">
                                            <span
                                              className="public-status-table__dot"
                                              style={{ background: STATUS_ACCENT[resource.status] }}
                                              aria-hidden
                                            />
                                            <span className={statusBadgeClass(resource.status)}>
                                              {RESOURCE_LABELS[resource.status]}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </section>
                            ),
                          )
                        )}

                        {data.incidents.length > 0 && (
                          <section className="public-status-sheet__section public-status-sheet__section--incidents">
                            <h2 className="public-status-sheet__section-title">Incidents</h2>
                            <ul className="public-status-incidents">
                              {data.incidents.map((incident) => (
                                <li key={incident.id} className="public-status-incident">
                                  <div className="public-status-incident__header">
                                    <h3 className="public-status-incident__title">{incident.title}</h3>
                                    <span className="public-thread-row__badge">
                                      {incident.endedAt ? 'Resolved' : RESOURCE_LABELS[incident.state]}
                                    </span>
                                  </div>
                                  <p className="public-status-incident__meta">
                                    Started {formatDateTime(incident.startedAt)}
                                    {incident.endedAt ? ` · Resolved ${formatDateTime(incident.endedAt)}` : ''}
                                  </p>
                                  {incident.updates.length > 0 && (
                                    <ul className="public-status-updates">
                                      {incident.updates.map((update) => (
                                        <li key={update.id} className="public-status-update">
                                          <time className="public-status-update__time" dateTime={update.publishedAt}>
                                            {formatDateTime(update.publishedAt)}
                                          </time>
                                          <p className="public-status-update__message">{update.message}</p>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}

                        <section className="public-status-sheet__support">
                          <ul className="public-status-support">
                            <li>
                              <a className="public-status-support__link" href={SUPPORT_MAILTO}>
                                <span className="public-status-support__label">Email</span>
                                <span className="public-status-support__title">{FOUNDER_EMAIL}</span>
                                <span className="public-status-support__detail">Bug, idea, or question — any time</span>
                              </a>
                            </li>
                            {isSignedIn && (
                              <li>
                                <a className="public-status-support__link" href={prototypeHref('settings/support')}>
                                  <span className="public-status-support__label">In the app</span>
                                  <span className="public-status-support__title">Settings → Support</span>
                                  <span className="public-status-support__detail">
                                    Sends device context so we can help faster
                                  </span>
                                </a>
                              </li>
                            )}
                          </ul>
                        </section>
                      </div>
                    </article>
                  </div>

                  <div className="public-footer public-footer--rich">
                    <span className="public-footer__kicker">Stay in the loop</span>
                    <span className="public-footer__tag">
                      {data.subscribeUrl ? (
                        <>
                          Get notified when something changes.{' '}
                          <a
                            href={data.subscribeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="public-footer__cta"
                          >
                            Subscribe to updates →
                          </a>
                        </>
                      ) : (
                        <>Harvous is a notes app for Bible study.</>
                      )}
                      {data.rssUrl && (
                        <>
                          {' '}
                          <a
                            href={data.rssUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="public-footer__cta"
                          >
                            RSS
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                </>
              </SubtleContentMount>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
