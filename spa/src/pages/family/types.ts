import type { ChildBibleTranslation, ChildFamilyReading, ChildNotebookPreferences } from '../../../../shared/child-notebook';

export type FamilyChild = {
  id: string; displayName: string; ageBand: string; status: string;
  bibleTranslations: ChildBibleTranslation[]; notebookPreferences: ChildNotebookPreferences | null;
  consentedAt: string; noticeVersion: string; revokedAt: string | null;
};
export type ChildNote = { id: string; title: string | null; content: string; updatedAt: string | null };
export type FamilyStatus = {
  available: boolean; children: FamilyChild[]; noticeVersion: string;
  verifications: { id: string; status: string }[];
};
export type ChildDetail = {
  child: FamilyChild; notes: ChildNote[];
  readings: ChildFamilyReading[];
  approvals: { spaceId: string }[]; ministries: { id: string; title: string }[];
};

export type ChildMaterial = ChildNote & { spaceId: string; spaceTitle: string };
export type ChildSearchScope = 'all' | 'notebook' | 'family';
export type ChildSearchResult = { id: string; title: string; source: string } & (
  { kind: 'note' | 'reading' } | { kind: 'material'; spaceId: string }
);
