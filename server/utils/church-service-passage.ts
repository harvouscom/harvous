/**
 * Canonicalize the scripture reference a staff member types into the teaching plan.
 *
 * A service reference has to survive a round trip the VOTD passage never makes:
 * a pastor types it once, weeks ahead, often on a phone, and every congregant
 * then gets it rendered as a real pill inside a note they will keep. A
 * reference that "looks fine" but doesn't resolve becomes "Could not load this
 * passage" in someone's Sunday notes, so this is a gate, not a formatter.
 *
 * Pure — no DB, no network. Route handlers own the HTTP shape.
 */
import {
  normalizeScriptureReference,
  checkScriptureReferenceValidity,
  repairUnresolvableReference,
} from '../../src/utils/scripture-detector';

export type ServiceReferenceResult =
  | { ok: true; reference: string | null }
  | { ok: false; reason: string };

/**
 * Normalize → validate → repair → re-validate.
 *
 * An empty reference is **legal and returns null** — a topical Sunday has no
 * passage, and every downstream surface tolerates it. Don't turn this into a
 * required field.
 */
export function canonicalizeServiceReference(raw: string | null | undefined): ServiceReferenceResult {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: true, reference: null };

  const normalized = normalizeScriptureReference(trimmed);

  const firstPass = checkScriptureReferenceValidity(normalized);
  if (firstPass.ok) return { ok: true, reference: normalized };

  // The iOS predictive-text case: `Exodus 16:1620` is a dropped hyphen, not a
  // verse 1620. repairUnresolvableReference only fixes it when exactly one
  // split yields a real ascending range, so an ambiguous typo is never guessed.
  const repaired = repairUnresolvableReference(normalized);
  if (repaired) {
    const secondPass = checkScriptureReferenceValidity(repaired);
    if (secondPass.ok) return { ok: true, reference: repaired };
  }

  // Surface the validator's own wording ("Romans has 16 chapters.") rather than
  // a generic message — it is already written for a human to act on.
  return { ok: false, reason: firstPass.reason };
}
