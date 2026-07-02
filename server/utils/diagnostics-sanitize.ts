import { createHash } from 'crypto';
import {
  isDiagnosticPlatform,
  isDiagnosticSeverity,
  isDiagnosticSource,
  isDiagnosticSourceEnv,
  type DiagnosticPlatform,
  type DiagnosticSeverity,
  type DiagnosticSource,
  type DiagnosticSourceEnv,
} from '@/utils/diagnostic-sources';
import { redactDiagnosticRoute, scrubDiagnosticText } from '@/utils/diagnostics-route';

const MAX_MESSAGE = 500;
const MAX_STACK = 2000;
const MAX_MANUAL_NOTE = 500;
const MAX_ROUTE = 300;
const MAX_SESSION_ID = 64;
const MAX_APP_VERSION = 40;
const MAX_METADATA_JSON = 2000;

export type SanitizedDiagnosticInput = {
  source: DiagnosticSource;
  severity: DiagnosticSeverity;
  message: string;
  stack: string | null;
  route: string | null;
  platform: DiagnosticPlatform;
  appVersion: string | null;
  anonymousSessionId: string;
  manualNote: string | null;
  metadata: Record<string, unknown> | null;
  issueSignature: string;
  sourceEnv: DiagnosticSourceEnv;
};

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max);
}

export function topStackFrame(stack: string | null | undefined): string {
  if (!stack) return '';
  const lines = stack.split('\n').map((l) => l.trim()).filter(Boolean);
  const frame = lines.find((l) => l.startsWith('at ')) ?? lines[1] ?? lines[0] ?? '';
  return scrubDiagnosticText(truncate(frame, 200));
}

export function computeIssueSignature(message: string, route: string | null, stack: string | null): string {
  const normalized = [
    scrubDiagnosticText(message).toLowerCase(),
    route ?? '',
    topStackFrame(stack),
  ].join('::');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

function sanitizeMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof raw.statusCode === 'number' && Number.isFinite(raw.statusCode)) {
    out.statusCode = Math.round(raw.statusCode);
  }
  if (typeof raw.apiPath === 'string' && raw.apiPath.trim()) {
    out.apiPath = redactDiagnosticRoute(raw.apiPath.trim());
  }
  if (typeof raw.userAgentFamily === 'string' && raw.userAgentFamily.trim()) {
    out.userAgentFamily = truncate(scrubDiagnosticText(raw.userAgentFamily.trim()), 80);
  }
  if (Object.keys(out).length === 0) return null;
  const json = JSON.stringify(out);
  if (json.length > MAX_METADATA_JSON) return null;
  return out;
}

export function sanitizeDiagnosticPayload(body: unknown): SanitizedDiagnosticInput | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;

  const source = typeof raw.source === 'string' ? raw.source : '';
  const severity = typeof raw.severity === 'string' ? raw.severity : 'error';
  if (!isDiagnosticSource(source)) return null;
  if (!isDiagnosticSeverity(severity)) return null;

  const messageRaw = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (!messageRaw) return null;

  const anonymousSessionId =
    typeof raw.anonymousSessionId === 'string' ? raw.anonymousSessionId.trim() : '';
  if (!anonymousSessionId || anonymousSessionId.length > MAX_SESSION_ID) return null;

  const platform = typeof raw.platform === 'string' ? raw.platform : 'unknown';
  if (!isDiagnosticPlatform(platform)) return null;

  const stackRaw = typeof raw.stack === 'string' ? raw.stack : null;
  const routeRaw = typeof raw.route === 'string' ? raw.route : null;
  const appVersionRaw = typeof raw.appVersion === 'string' ? raw.appVersion.trim() : null;
  const manualNoteRaw = typeof raw.manualNote === 'string' ? raw.manualNote.trim() : null;

  const message = truncate(scrubDiagnosticText(messageRaw), MAX_MESSAGE);
  const stack = stackRaw ? truncate(scrubDiagnosticText(stackRaw), MAX_STACK) : null;
  const route = routeRaw ? truncate(redactDiagnosticRoute(routeRaw), MAX_ROUTE) : null;
  const appVersion = appVersionRaw ? truncate(scrubDiagnosticText(appVersionRaw), MAX_APP_VERSION) : null;
  const manualNote =
    source === 'client_manual' && manualNoteRaw
      ? truncate(scrubDiagnosticText(manualNoteRaw), MAX_MANUAL_NOTE)
      : null;

  const metadata = sanitizeMetadata(raw.metadata);
  const issueSignature = computeIssueSignature(message, route, stack);

  const sourceEnvRaw = typeof raw.sourceEnv === 'string' ? raw.sourceEnv : '';
  const sourceEnv: DiagnosticSourceEnv = isDiagnosticSourceEnv(sourceEnvRaw) ? sourceEnvRaw : 'prod';

  return {
    source,
    severity,
    message,
    stack,
    route,
    platform,
    appVersion,
    anonymousSessionId,
    manualNote,
    metadata,
    issueSignature,
    sourceEnv,
  };
}

// Re-export for tests
export { redactDiagnosticRoute, scrubDiagnosticText };
