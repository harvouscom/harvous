export type FamilyChild = {
  id: string; displayName: string; ageBand: string; status: string;
  consentedAt: string; noticeVersion: string; revokedAt: string | null;
};
export type ChildNote = { id: string; title: string | null; content: string; updatedAt: string | null };
export type FamilyStatus = {
  available: boolean; children: FamilyChild[]; noticeVersion: string;
  verifications: { id: string; status: string }[];
};
export type ChildDetail = {
  child: FamilyChild; notes: ChildNote[];
  approvals: { spaceId: string }[]; ministries: { id: string; title: string }[];
};
