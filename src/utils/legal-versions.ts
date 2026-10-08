/**
 * The current Privacy Policy and Terms of Service, by version — one source for the app and the
 * server.
 *
 * The documents themselves live on harvous.com (`src/components/legal/*Body.astro`, dates in
 * `src/lib/legal.ts` there). These versions must move with those dates: when a document changes,
 * bump its `version` and `label` here in the same release that publishes the new text, and every
 * signed-in account is shown the "we've updated" notice once (`PrototypeFeatureCallout`).
 *
 * The version is the effective date, ISO, so it sorts and reads at once. What a reader
 * acknowledged is recorded per account in `LegalAcknowledgments`, append-only — this file says
 * what is current; that table says who has seen what, and when.
 */
export type LegalDocument = 'privacy' | 'terms';

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = ['privacy', 'terms'];

export interface LegalDocumentVersion {
  /** Effective date, ISO (YYYY-MM-DD). The value recorded on acknowledgment. */
  version: string;
  /** The same date as the reader sees it. */
  label: string;
  url: string;
  /** Its name in a sentence. */
  name: string;
}

export const LEGAL: Record<LegalDocument, LegalDocumentVersion> = {
  privacy: {
    version: '2026-10-08',
    label: 'October 8, 2026',
    url: 'https://harvous.com/privacy/',
    name: 'Privacy Policy',
  },
  terms: {
    version: '2026-10-08',
    label: 'October 8, 2026',
    url: 'https://harvous.com/terms/',
    name: 'Terms of Service',
  },
};

/** The plain-English "what changed" page the notice links to. */
export const LEGAL_CHANGES_URL = 'https://harvous.com/legal/changes/';

/** Where an acknowledgment was given — kept for the audit trail. */
export type LegalAcknowledgmentSurface = 'signup' | 'notice' | 'settings';

export const LEGAL_ACKNOWLEDGMENT_SURFACES: readonly LegalAcknowledgmentSurface[] = ['signup', 'notice', 'settings'];

/**
 * Which documents have changed since this account last acknowledged them.
 *
 * An account with no record at all (everyone, the day this shipped) is due both: it has never
 * been shown either document in the app.
 */
export function legalDocumentsDue(
  acknowledged: Partial<Record<LegalDocument, string | null>>,
): LegalDocument[] {
  return LEGAL_DOCUMENTS.filter((doc) => {
    const seen = acknowledged[doc];
    return !seen || seen < LEGAL[doc].version;
  });
}

/** "Privacy Policy", "Terms of Service", or "Privacy Policy and Terms" — for the notice's title. */
export function legalDocumentsPhrase(docs: readonly LegalDocument[]): string {
  if (docs.length === 2) return 'Privacy Policy and Terms';
  return docs[0] ? LEGAL[docs[0]].name : '';
}
