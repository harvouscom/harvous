import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { Notes } from '../db/schema';
import { familyReadings } from './bible';
import { ministryMaterials, type Child, type FamilyTx } from './service';

export type SearchScope = 'all' | 'notebook' | 'family';
const pageSize = 20;

export async function searchChildNotebook(tx: FamilyTx, child: Child, query: string, scope: SearchScope, offset: number) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every(word => text.toLowerCase().includes(word));
  const notes = scope === 'family' ? [] : await tx.select({ id: Notes.id, title: Notes.title }).from(Notes)
    .where(and(eq(Notes.userId, child.id), ...words.map(word => sql`strpos(lower(coalesce(${Notes.title}, '') || ' ' || ${Notes.content}), ${word}) > 0`)))
    .orderBy(desc(Notes.updatedAt), asc(Notes.id));
  const materials = scope === 'notebook' ? [] : (await ministryMaterials(tx, child))
    .filter(item => matches(`${item.title ?? ''} ${item.spaceTitle} ${item.content}`));
  const readings = scope === 'notebook' ? [] : (await familyReadings(tx, child))
    .filter(item => child.bibleTranslations.includes(item.translation) && matches(`${item.book} ${item.chapter} ${item.translation} Family Bible`));
  const results = [
    ...notes.map(({ id, title }) => ({ kind: 'note' as const, id, title: title || 'Untitled note', source: 'My notebook' })),
    ...readings.map(({ id, book, chapter, translation }) => ({ kind: 'reading' as const, id, title: `${book} ${chapter}`, source: `Family Bible · ${translation}` })),
    ...materials.map(({ id, title, spaceId, spaceTitle }) => ({ kind: 'material' as const, id, spaceId, title: title || 'Reading', source: spaceTitle }))
  ];
  return { results: results.slice(offset, offset + pageSize), total: results.length };
}
