/**
 * My Home's library, fetched while a shared space's is on screen.
 *
 * Inside a shared space the panel opens on the room, with My Home one tap away on the switch
 * (see `PrototypeLibraryPanelHost`). Nothing else mounted there reads Home's corpora — the
 * room's hub replaces Activity — so without this the tap is where fetching starts, and the
 * switch answers with a skeleton. Fetched alongside the room's lists instead, the tap paints
 * from cache.
 *
 * The same hooks the views call, not prefetches with keys spelled out here: a key one element
 * off from the reader's warms an entry nobody reads, and nothing fails loudly when it does.
 */
import { useSpaceNotes } from '../../../hooks/queries/useSpace';
import { usePrototypeStudyThreads } from '../../../hooks/queries/usePrototypeStudyThreads';
import { usePrototypeSpaceStudyThreadHighlights } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeSpaceScriptureIndex } from '../../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { usePrototypeFolderRegistry } from '../../../hooks/mutations/usePrototypeFolderRegistry';

/** @param homeSpaceId My Home's id, or undefined to warm nothing. */
export function useWarmLibraryHome(homeSpaceId: string | undefined): void {
  /* 20, matching `useLibraryPanelData` — the page size is part of the key. */
  useSpaceNotes(homeSpaceId ?? '', 20);
  usePrototypeStudyThreads(homeSpaceId);
  usePrototypeSpaceStudyThreadHighlights(homeSpaceId);
  usePrototypeFolderRegistry(homeSpaceId);
  usePrototypeSpaceScriptureIndex(homeSpaceId);
}
