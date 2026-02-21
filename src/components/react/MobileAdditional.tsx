import React from 'react';

interface MobileAdditionalProps {
  contentType?: "thread" | "note" | "space" | "dashboard" | "profile" | "search" | "new-space";
  contentId?: string;
  currentThread?: any;
  currentSpace?: any;
  currentThreadId?: string;
  noteType?: string;
  contentEncrypted?: boolean;
  noteSimpleId?: number | null;
  spaceRole?: 'owner' | 'member' | null;
  contentOwnerId?: string;
  userId?: string;
}

export default function MobileAdditional(_props: MobileAdditionalProps) {
  return null;
}
