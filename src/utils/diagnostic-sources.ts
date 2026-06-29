/** Shared allowlist for anonymous diagnostic events (client + server). */

export const DIAGNOSTIC_SOURCES = ['client_js', 'client_api', 'client_manual', 'server_api'] as const;
export type DiagnosticSource = (typeof DIAGNOSTIC_SOURCES)[number];

export const DIAGNOSTIC_SEVERITIES = ['error', 'warning'] as const;
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

export const DIAGNOSTIC_TRIAGE_STATUSES = ['open', 'resolved', 'ignored'] as const;
export type DiagnosticTriageStatus = (typeof DIAGNOSTIC_TRIAGE_STATUSES)[number];

export const DIAGNOSTIC_PLATFORMS = ['web', 'ios', 'unknown'] as const;
export type DiagnosticPlatform = (typeof DIAGNOSTIC_PLATFORMS)[number];

export function isDiagnosticSource(value: string): value is DiagnosticSource {
  return (DIAGNOSTIC_SOURCES as readonly string[]).includes(value);
}

export function isDiagnosticSeverity(value: string): value is DiagnosticSeverity {
  return (DIAGNOSTIC_SEVERITIES as readonly string[]).includes(value);
}

export function isDiagnosticTriageStatus(value: string): value is DiagnosticTriageStatus {
  return (DIAGNOSTIC_TRIAGE_STATUSES as readonly string[]).includes(value);
}

export function isDiagnosticPlatform(value: string): value is DiagnosticPlatform {
  return (DIAGNOSTIC_PLATFORMS as readonly string[]).includes(value);
}
