/**
 * Who has seen which Privacy Policy and Terms — reading and writing `LegalAcknowledgments`.
 *
 * The versions recorded are always the server's current ones (`LEGAL`), never what a client
 * says: an acknowledgment is a statement that this account was shown *this* text, and only the
 * server knows which text that is.
 *
 * Until the table is created on a database (`server/db/manual/create-legal-acknowledgments.sql`
 * or `db:push`), reads answer "nothing acknowledged" — so nobody is shown a notice they cannot
 * clear — and writes are skipped. Both say so in the logs rather than failing the request.
 */
import { db, LegalAcknowledgments, and, desc, eq } from '../db';
import { generateTimestampId } from '@/utils/ids';
import {
  LEGAL,
  LEGAL_DOCUMENTS,
  legalDocumentsDue,
  type LegalAcknowledgmentSurface,
  type LegalDocument,
} from '@/utils/legal-versions';
import { isPgUndefinedRelation } from './pg-undefined-relation';

function tableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'LegalAcknowledgments');
}

export interface LegalStatus {
  current: Record<LegalDocument, string>;
  acknowledged: Record<LegalDocument, string | null>;
  /** Documents changed since the account last acknowledged them. Empty when the table is missing. */
  due: LegalDocument[];
}

/** The latest acknowledged version of each document for this account. */
export async function legalStatusForUser(userId: string): Promise<LegalStatus> {
  const current = { privacy: LEGAL.privacy.version, terms: LEGAL.terms.version };
  const acknowledged: Record<LegalDocument, string | null> = { privacy: null, terms: null };
  try {
    for (const doc of LEGAL_DOCUMENTS) {
      const [row] = await db
        .select({ version: LegalAcknowledgments.version })
        .from(LegalAcknowledgments)
        .where(and(eq(LegalAcknowledgments.userId, userId), eq(LegalAcknowledgments.document, doc)))
        .orderBy(desc(LegalAcknowledgments.version))
        .limit(1);
      acknowledged[doc] = row?.version ?? null;
    }
  } catch (error) {
    if (tableMissing(error)) {
      console.warn('[legal] LegalAcknowledgments table missing — run create-legal-acknowledgments.sql');
      return { current, acknowledged, due: [] };
    }
    throw error;
  }
  return { current, acknowledged, due: legalDocumentsDue(acknowledged) };
}

/**
 * Record that this account acknowledged the current version of each named document.
 * Idempotent per version: a second acknowledgment of the same version writes nothing.
 */
export async function acknowledgeLegal(
  userId: string,
  documents: readonly LegalDocument[],
  surface: LegalAcknowledgmentSurface,
  now: Date = new Date(),
): Promise<LegalStatus> {
  try {
    const status = await legalStatusForUser(userId);
    const rows = documents
      .filter((doc) => status.acknowledged[doc] !== LEGAL[doc].version)
      .map((doc) => ({
        id: generateTimestampId('legal'),
        userId,
        document: doc,
        version: LEGAL[doc].version,
        surface,
        acknowledgedAt: now,
      }));
    if (rows.length > 0) await db.insert(LegalAcknowledgments).values(rows);
  } catch (error) {
    if (tableMissing(error)) {
      console.warn('[legal] LegalAcknowledgments table missing — acknowledgment not recorded');
    } else {
      throw error;
    }
  }
  return legalStatusForUser(userId);
}
