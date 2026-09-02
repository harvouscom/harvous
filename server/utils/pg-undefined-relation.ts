/**
 * Detect Postgres undefined_relation (42P01) errors from Drizzle/driver chains.
 * Used when optional/new tables are missing until `npm run db:push` is applied.
 */

export function isPgUndefinedRelation(error: unknown, relationName: string): boolean {
  const needle = `relation "${relationName}" does not exist`;
  let current: unknown = error;
  const seen = new Set<unknown>();

  for (let depth = 0; depth < 12 && current != null; depth++) {
    if (typeof current === 'object' && current !== null) {
      if (seen.has(current)) break;
      seen.add(current);
    }

    const msg = current instanceof Error ? current.message : typeof current === 'string' ? current : '';
    const code =
      current !== null &&
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: unknown }).code != null
        ? String((current as { code: unknown }).code)
        : '';

    if (msg.includes(needle)) return true;
    if (code === '42P01' && msg.includes(relationName)) return true;

    current =
      current instanceof Error && 'cause' in current
        ? (current as Error & { cause?: unknown }).cause
        : undefined;
  }

  return false;
}

export function isStudyThreadEntriesTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'StudyThreadEntries');
}

export function isNoteConnectionsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'NoteConnections');
}

export function isSpaceMembershipsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'SpaceMemberships');
}

export function isSpaceMembershipsLastVisitedColumnMissing(error: unknown): boolean {
  return isPgUndefinedColumn(error, 'lastVisitedAt');
}

export function isSyncDeletedEntitiesTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'SyncDeletedEntities');
}

export function isNoteFingerprintsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'NoteFingerprints');
}

export function isRecallEventsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'RecallEvents');
}

export function isSearchEventsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'SearchEvents');
}

export function isReadingEventsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'ReadingEvents');
}

export function isNoteVisitEventsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'NoteVisitEvents');
}

export function isReviewItemsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'ReviewItems');
}

export function isReviewEventsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'ReviewEvents');
}

export function isUserNodeStatesTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'UserNodeStates');
}

export function isChallengesTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'Challenges');
}

/** Any of the three Review/Challenge tables — the surfaces read them together. */
export function isReviewTableMissing(error: unknown): boolean {
  return (
    isReviewItemsTableMissing(error) ||
    isReviewEventsTableMissing(error) ||
    isChallengesTableMissing(error)
  );
}

export function isSupportTicketsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'SupportTickets');
}

export function isDiagnosticEventsTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'DiagnosticEvents');
}

export function isDiagnosticIssueTriageTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'DiagnosticIssueTriage');
}

/** Postgres undefined_column (42703) — schema not pushed yet. */
export function isPgUndefinedColumn(error: unknown, columnName: string): boolean {
  const needles = [`column "${columnName}" does not exist`, `column ${columnName} does not exist`];
  let current: unknown = error;
  const seen = new Set<unknown>();

  for (let depth = 0; depth < 12 && current != null; depth++) {
    if (typeof current === 'object' && current !== null) {
      if (seen.has(current)) break;
      seen.add(current);
    }

    const msg = current instanceof Error ? current.message : typeof current === 'string' ? current : '';
    const code =
      current !== null &&
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: unknown }).code != null
        ? String((current as { code: unknown }).code)
        : '';

    if (needles.some((n) => msg.includes(n))) return true;
    if (code === '42703' && msg.includes(columnName)) return true;
    // Drizzle wraps Postgres errors as "Failed query: select ... \"columnName\" ..."
    if (msg.includes('Failed query') && msg.includes(`"${columnName}"`)) return true;

    current =
      current instanceof Error && 'cause' in current
        ? (current as Error & { cause?: unknown }).cause
        : undefined;
  }

  return false;
}

export function isStudyThreadNamingColumnMissing(error: unknown): boolean {
  return (
    isPgUndefinedColumn(error, 'studyThreadUserOverride') ||
    isPgUndefinedColumn(error, 'studyThreadPinned') ||
    isPgUndefinedColumn(error, 'studyThreadLastAutoSuggestedAt') ||
    isPgUndefinedColumn(error, 'studyThreadTitle')
  );
}


export function isPrototypeFolderStatsColumnMissing(error: unknown): boolean {
  return (
    isPgUndefinedColumn(error, 'primaryCollection') ||
    isPgUndefinedColumn(error, 'secondaryCollections') ||
    isPgUndefinedColumn(error, 'prototypeEmptyFolderLabels')
  );
}
