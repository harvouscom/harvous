/**
 * Parse Better Stack status page JSON:API (`/index.json`) into a flat shape for the SPA.
 * @see https://betterstack.com/docs/uptime/status-pages/subscribing-to-status-updates/subscribing-to-api/
 */

export type AggregateState = 'operational' | 'degraded' | 'downtime' | 'maintenance';

export type ResourceStatus = AggregateState | 'not_monitored';

export interface PublicStatusResource {
  id: string;
  name: string;
  status: ResourceStatus;
  explanation: string | null;
  position: number;
  availability: number | null;
}

export interface PublicStatusSection {
  id: string;
  name: string;
  position: number;
  resources: PublicStatusResource[];
}

export interface PublicStatusIncidentUpdate {
  id: string;
  message: string;
  publishedAt: string;
}

export interface PublicStatusIncident {
  id: string;
  title: string;
  reportType: string;
  state: AggregateState;
  startedAt: string;
  endedAt: string | null;
  updates: PublicStatusIncidentUpdate[];
}

export interface PublicStatusResponse {
  aggregateState: AggregateState;
  announcement: string | null;
  updatedAt: string;
  subscribeUrl: string | null;
  rssUrl: string | null;
  sections: PublicStatusSection[];
  incidents: PublicStatusIncident[];
}

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: Array<{ id: string; type: string }> | { id: string; type: string } | null }>;
}

interface BetterStackStatusPayload {
  data?: JsonApiResource;
  included?: JsonApiResource[];
}

const AGGREGATE_STATES = new Set<AggregateState>(['operational', 'degraded', 'downtime', 'maintenance']);

function asAggregateState(value: unknown): AggregateState {
  if (typeof value === 'string' && AGGREGATE_STATES.has(value as AggregateState)) {
    return value as AggregateState;
  }
  return 'operational';
}

function asResourceStatus(value: unknown): ResourceStatus {
  if (value === 'not_monitored') return 'not_monitored';
  return asAggregateState(value);
}

function includedByType(included: JsonApiResource[], type: string): Map<string, JsonApiResource> {
  const map = new Map<string, JsonApiResource>();
  for (const item of included) {
    if (item.type === type) map.set(item.id, item);
  }
  return map;
}

function relationshipIds(resource: JsonApiResource | undefined, relName: string): string[] {
  const rel = resource?.relationships?.[relName]?.data;
  if (!rel) return [];
  if (Array.isArray(rel)) return rel.map((r) => r.id);
  return [rel.id];
}

export function deriveBetterStackUrls(jsonUrl: string): { subscribeUrl: string; rssUrl: string } {
  const base = jsonUrl.replace(/\/index\.json\/?$/, '');
  return {
    subscribeUrl: base,
    rssUrl: `${base}/rss`,
  };
}

/** Accepts bare hostnames (`status.harvous.com`) or full JSON URLs. */
export function normalizeBetterStackJsonUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/index.json';
    } else if (!parsed.pathname.endsWith('/index.json')) {
      parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/index.json`;
    }
    return parsed.toString();
  } catch {
    return url.endsWith('/index.json') ? url : `${url.replace(/\/$/, '')}/index.json`;
  }
}

export function parseBetterStackStatus(raw: unknown, jsonUrl: string): PublicStatusResponse {
  const payload = raw as BetterStackStatusPayload;
  const page = payload.data;
  const attrs = page?.attributes ?? {};
  const included = payload.included ?? [];

  const sectionsById = includedByType(included, 'status_page_section');
  const resourcesById = includedByType(included, 'status_page_resource');
  const reportsById = includedByType(included, 'status_report');
  const updatesById = includedByType(included, 'status_update');

  const sectionIds = relationshipIds(page, 'sections');
  const resourceIds = relationshipIds(page, 'resources');
  const reportIds = relationshipIds(page, 'status_reports');

  const resources: PublicStatusResource[] = resourceIds
    .map((id) => {
      const item = resourcesById.get(id);
      if (!item) return null;
      const a = item.attributes ?? {};
      return {
        id: item.id,
        name: String(a.public_name ?? 'Service'),
        status: asResourceStatus(a.status),
        explanation: typeof a.explanation === 'string' ? a.explanation : null,
        position: typeof a.position === 'number' ? a.position : 0,
        availability: typeof a.availability === 'number' ? a.availability : null,
        sectionId: String(a.status_page_section_id ?? ''),
      };
    })
    .filter((r): r is PublicStatusResource & { sectionId: string } => r != null);

  const sections: PublicStatusSection[] = sectionIds
    .map((id) => {
      const item = sectionsById.get(id);
      if (!item) return null;
      const a = item.attributes ?? {};
      const sectionResources = resources
        .filter((r) => r.sectionId === id)
        .sort((a, b) => a.position - b.position)
        .map(({ sectionId: _s, ...rest }) => rest);
      return {
        id: item.id,
        name: String(a.name ?? 'Services'),
        position: typeof a.position === 'number' ? a.position : 0,
        resources: sectionResources,
      };
    })
    .filter((s): s is PublicStatusSection => s != null)
    .sort((a, b) => a.position - b.position);

  // Resources not assigned to a known section — attach to a synthetic bucket if any.
  const assignedIds = new Set(sections.flatMap((s) => s.resources.map((r) => r.id)));
  const orphanResources = resources
    .filter((r) => !assignedIds.has(r.id))
    .sort((a, b) => a.position - b.position)
    .map(({ sectionId: _s, ...rest }) => rest);
  if (orphanResources.length > 0) {
    sections.push({
      id: 'ungrouped',
      name: 'Services',
      position: sections.length,
      resources: orphanResources,
    });
  }

  const incidents: PublicStatusIncident[] = reportIds
    .map((id) => {
      const item = reportsById.get(id);
      if (!item) return null;
      const a = item.attributes ?? {};
      const updateIds = relationshipIds(item, 'status_updates');
      const updates = updateIds
        .map((uid) => {
          const u = updatesById.get(uid);
          if (!u) return null;
          const ua = u.attributes ?? {};
          return {
            id: u.id,
            message: String(ua.message ?? ''),
            publishedAt: String(ua.published_at ?? ''),
          };
        })
        .filter((u): u is PublicStatusIncidentUpdate => u != null)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

      return {
        id: item.id,
        title: String(a.title ?? 'Incident'),
        reportType: String(a.report_type ?? 'manual'),
        state: asAggregateState(a.aggregate_state),
        startedAt: String(a.starts_at ?? ''),
        endedAt: typeof a.ends_at === 'string' ? a.ends_at : null,
        updates,
      };
    })
    .filter((i): i is PublicStatusIncident => i != null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const { subscribeUrl, rssUrl } = deriveBetterStackUrls(jsonUrl);

  return {
    aggregateState: asAggregateState(attrs.aggregate_state),
    announcement: typeof attrs.announcement === 'string' ? attrs.announcement : null,
    updatedAt: String(attrs.updated_at ?? new Date().toISOString()),
    subscribeUrl,
    rssUrl,
    sections,
    incidents,
  };
}
