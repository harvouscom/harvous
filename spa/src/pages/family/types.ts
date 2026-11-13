import type { ChildNoteAttachment } from '../prototype/ChildNoteAttachmentPicker';
import type { ChildBibleTranslation, ChildFamilyReading, ChildNotebookPreferences } from '../../../../shared/child-notebook';

export type FamilyChild = {
  id: string; displayName: string; ageBand: string; status: string;
  bibleTranslations: ChildBibleTranslation[]; notebookPreferences: ChildNotebookPreferences | null;
  consentedAt: string; noticeVersion: string; revokedAt: string | null;
};
export type ChildNote = { id: string; title: string | null; content: string; updatedAt: string | null; primaryCollection?: string | null; tagIds?: string[]; threadIds?: string[]; attachments?: ChildNoteAttachment[] };
export type FamilyStatus = {
  available: boolean; requiresPlus: boolean; children: FamilyChild[]; noticeVersion: string;
  /** The parent has Harvous Plus (the check that gates setup), sent even while setup is closed. */
  plus?: boolean;
  verifications: { id: string; status: string }[];
  /** Per-parent child notebook cap and how many places are taken. Absent from older API responses. */
  childNotebookMax?: number; childNotebookPlacesHeld?: number;
};
export type ChildDetail = {
  child: FamilyChild; notes: ChildNote[];
  readings: ChildFamilyReading[];
  approvals: { spaceId: string }[]; ministries: { id: string; title: string }[];
  /** Every agreement to the child privacy notice, oldest first. Absent from older API responses. */
  consents?: ChildConsent[];
};

export type ChildConsent = { noticeVersion: string; consentedAt: string; kind: 'created' | 'renewed' | string };

export type ChildMaterial = ChildNote & { spaceId: string; spaceTitle: string };
export type ChildSearchScope = 'all' | 'notebook' | 'family';
export type ChildSearchResult = { id: string; title: string; source: string } & (
  { kind: 'note' | 'reading' } | { kind: 'material'; spaceId: string }
);
