import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('shared Thread loop contracts', () => {
  it('loads all active unencrypted NoteThreads rows for owners and members', () => {
    const routes = source('server/routes/threads.ts');
    const data = source('server/utils/dashboard-data.ts');
    expect(routes).toContain(
      '? await getNotesForThreadForMember(threadId, auth.userId, limit, offset)',
    );
    expect(data).toContain('eq(NoteThreads.threadId, threadId)');
    expect(data).toContain('isNull(SpaceNotes.removedAt)');
    expect(data).toContain('eq(Notes.contentEncrypted, false)');
    expect(routes).toContain('attributeSharedThreadNotesForViewer(result.notes, auth.userId)');
  });

  it('keeps user-facing shared Thread copy free of legacy terminology', () => {
    const dashboard = source('spa/src/pages/prototype/PrototypeSpaceHub.tsx');
    const create = source('spa/src/pages/prototype/PrototypeCreateSharedThreadSheet.tsx');
    const drilldown = source('spa/src/pages/prototype/PrototypeSharedThreadDrilldown.tsx');
    const ui = [dashboard, create, drilldown].join('\n');
    expect(ui).not.toMatch(/Study Thread|group study|Current group/i);
    expect(drilldown).toContain('<SharedSpaceNoteAuthorChip');
    // Owner menu now also shows on a pinned thread when a delete handler is supplied.
    expect(drilldown).toContain('isOwner && (!thread.isPinned || Boolean(onRequestDelete))');
    expect(create).toContain('if (!isOwner) return null');
  });
});
