/**
 * Read a church's review exercises for the Review engine.
 *
 * The one place the engine loads `ChurchReviewExercises`, so every path that asks, grades or
 * reveals a church item reads the same definition the same way. Joined to the channel for its
 * title — the framing line ("From Youth.") and nothing else.
 *
 * Never returns anything about who else holds an exercise: this is the definition, and the
 * reader's row is theirs.
 */
import { db, ChurchReviewExercises, Spaces, eq, inArray } from '../db';
import {
  isAuthoredChurchExerciseKind,
  parseChurchExerciseContent,
  type ChurchExerciseContent,
} from '@/utils/church-exercise';

export interface ChurchExerciseDefinition {
  id: string;
  kind: string;
  prompt: string | null;
  /** The parsed key, for authored kinds. Null when unreadable — the item is then unaskable. */
  content: ChurchExerciseContent | null;
  status: string;
  version: number;
  channelSpaceId: string;
  channelTitle: string | null;
  scriptureReference: string | null;
  translation: string | null;
}

export async function loadChurchExerciseDefinitions(
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, ChurchExerciseDefinition>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      id: ChurchReviewExercises.id,
      kind: ChurchReviewExercises.kind,
      prompt: ChurchReviewExercises.prompt,
      content: ChurchReviewExercises.content,
      status: ChurchReviewExercises.status,
      version: ChurchReviewExercises.version,
      channelSpaceId: ChurchReviewExercises.channelSpaceId,
      channelTitle: Spaces.title,
      scriptureReference: ChurchReviewExercises.scriptureReference,
      translation: ChurchReviewExercises.translation,
    })
    .from(ChurchReviewExercises)
    .leftJoin(Spaces, eq(Spaces.id, ChurchReviewExercises.channelSpaceId))
    .where(inArray(ChurchReviewExercises.id, unique));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        content: parseChurchExerciseContent(row.kind, row.content),
        channelTitle: row.channelTitle ?? null,
      },
    ]),
  );
}

/** Can a `church`-kind item be asked from this definition? */
export function churchQuestionIsAskable(definition: ChurchExerciseDefinition | undefined): boolean {
  return Boolean(
    definition &&
      definition.status === 'published' &&
      isAuthoredChurchExerciseKind(definition.kind) &&
      definition.content &&
      definition.prompt?.trim(),
  );
}
