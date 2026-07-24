import { describe, expect, it } from 'vitest';

import { REQUIRED_COLUMNS, validateRequiredTableColumns } from './validate-schema';

const generationOneStudyThreadEntryColumns = [
  'spaceId',
  'noteVersionId',
  'resolvedVersionId',
  'anchorQuote',
  'anchorPrefixContext',
  'anchorSuffixContext',
  'anchorStatus',
  'resolvedAnchorStart',
  'resolvedAnchorEnd',
  'anchorResolvedAt',
  'anchorDetachedAt',
  'actorDisplayNameSnapshot',
];

describe('validate-schema durable StudyThreadEntries columns', () => {
  it('reports the missing resolved version column as an actionable schema mismatch', () => {
    const actualColumns = generationOneStudyThreadEntryColumns.filter(
      (column) => column !== 'resolvedVersionId',
    );

    expect(validateRequiredTableColumns('StudyThreadEntries', actualColumns)).toEqual({
      missingColumns: ['resolvedVersionId'],
      message:
        'StudyThreadEntries schema mismatch — missing required columns: resolvedVersionId. Apply the pending schema migration before deployment.',
    });
  });

  it('requires every Generation 1 column selected by getTableColumns', () => {
    expect(REQUIRED_COLUMNS.StudyThreadEntries).toEqual(
      expect.arrayContaining(generationOneStudyThreadEntryColumns),
    );
  });

  it('passes when the complete durable column set is present', () => {
    expect(
      validateRequiredTableColumns('StudyThreadEntries', generationOneStudyThreadEntryColumns),
    ).toEqual({
      missingColumns: [],
      message: null,
    });
  });
});
