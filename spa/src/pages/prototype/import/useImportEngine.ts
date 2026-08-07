/**
 * Drives the import queue: creates the session, pumps work into the open slots, and
 * dispatches results back into the reducer. All scheduling decisions come from the
 * selectors in import-engine-state — this hook only performs requests.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshClientData } from '../../../lib/refresh-client-data';
import {
  MAX_IMPORT_FILES,
  collectFromDataTransfer,
  collectFromFileList,
  type ImportFileSource,
} from './import-file-sources';
import {
  commitImportItems,
  createImportSession,
  discardImportSession,
  enrichImportItems,
  finalizeImportSession,
  postImportManifest,
  setImportItemsIncluded,
  uploadImportFile,
} from './import-session-api';
import {
  importEngineReducer,
  initialImportEngineState,
  selectCommitBatch,
  selectContainerPhase,
  selectEnrichBatch,
  selectIsRunComplete,
  selectProgressCounts,
  selectReadyItemCount,
  selectUploadCandidates,
} from './import-engine-state';

const SESSION_STORAGE_KEY = 'harvous.import.sessionId';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function useImportEngine() {
  const [state, dispatch] = useReducer(importEngineReducer, initialImportEngineState);
  const queryClient = useQueryClient();
  const [fatalError, setFatalError] = useState<string | null>(null);

  /** Guards against the pump starting the same unit of work twice across renders. */
  const inFlightRef = useRef(new Set<string>());
  const sessionPromiseRef = useRef<Promise<string> | null>(null);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  /** Holds the actual File handles; the reducer only ever sees plain data. */
  const sourcesRef = useRef(new Map<string, ImportFileSource>());
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Unmounting with requests in the air leaves them running against a component
   * that will never read the answer. The server session is durable, so a later
   * visit resumes; what we drop here is only the client's half.
   */
  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (stateRef.current.sessionId) return stateRef.current.sessionId;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;
    const promise = createImportSession()
      .then((res) => {
        dispatch({ type: 'session-ready', sessionId: res.sessionId });
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, res.sessionId);
        } catch {
          /* private browsing — resume just won't be offered */
        }
        return res.sessionId;
      })
      .finally(() => {
        sessionPromiseRef.current = null;
      });
    sessionPromiseRef.current = promise;
    return promise;
  }, []);

  const addSources = useCallback(
    (collected: { sources: ImportFileSource[]; skipped: string[]; manifestConnections: Array<{ fromNoteId: string; toNoteId: string }> }) => {
      const room = MAX_IMPORT_FILES - stateRef.current.rows.length;
      const notices = [...collected.skipped];
      let sources = collected.sources;
      if (sources.length > room) {
        sources = sources.slice(0, Math.max(0, room));
        notices.push(`An import can hold ${MAX_IMPORT_FILES} files — the rest were left out.`);
      }
      if (sources.length === 0 && notices.length === 0) {
        notices.push('Nothing in that drop was a file we can import.');
      }
      for (const source of sources) sourcesRef.current.set(source.id, source);
      dispatch({
        type: 'add-files',
        sources,
        notices,
        manifestConnections: collected.manifestConnections,
      });
      if (sources.length > 0) void ensureSession();
    },
    [ensureSession],
  );

  const addFromDataTransfer = useCallback(
    async (dataTransfer: DataTransfer) => {
      const known = new Set(stateRef.current.rows.map((row) => row.path));
      addSources(await collectFromDataTransfer(dataTransfer, known));
    },
    [addSources],
  );

  const addFromFileList = useCallback(
    async (files: FileList | null) => {
      const known = new Set(stateRef.current.rows.map((row) => row.path));
      addSources(await collectFromFileList(files, known));
    },
    [addSources],
  );

  // ─── The pump ───────────────────────────────────────────────────────────────
  // One effect for all three phases. Each unit of work is keyed so a re-render
  // mid-request can't launch it a second time.

  useEffect(() => {
    if (!state.sessionId) return;

    // Backup manifests must land before finalize tries to rebuild the link graph.
    if (state.manifestConnections.length > 0 && !inFlightRef.current.has('manifest')) {
      inFlightRef.current.add('manifest');
      const connections = state.manifestConnections;
      const sessionId = state.sessionId;
      void postImportManifest(sessionId, connections)
        .then(() => dispatch({ type: 'manifest-sent' }))
        .catch(() => {
          dispatch({ type: 'notice', messages: ['Links between notes may not restore for this backup.'] });
          dispatch({ type: 'manifest-sent' });
        })
        .finally(() => inFlightRef.current.delete('manifest'));
    }

    for (const row of selectUploadCandidates(state)) {
      const key = `upload:${row.id}`;
      if (inFlightRef.current.has(key)) continue;
      inFlightRef.current.add(key);

      const source = sourcesRef.current.get(row.id);
      if (!source) {
        inFlightRef.current.delete(key);
        dispatch({ type: 'upload-failed', rowId: row.id, error: 'File is no longer available' });
        continue;
      }

      const controller = new AbortController();
      abortControllersRef.current.set(key, controller);
      dispatch({ type: 'upload-start', rowId: row.id });

      void (async () => {
        try {
          const file = await source.file();
          const response = await uploadImportFile({
            sessionId: state.sessionId!,
            clientFileId: row.id,
            folderPath: source.folderPath,
            file,
            signal: controller.signal,
            onProgress: (fraction) => {
              dispatch({ type: 'upload-progress', rowId: row.id, fraction });
              if (fraction >= 1) dispatch({ type: 'upload-parsing', rowId: row.id });
            },
          });
          dispatch({
            type: 'upload-done',
            rowId: row.id,
            items: response.items,
            warnings: [...(response.warnings ?? []), ...(response.unsupported ?? []).map((n) => `${n}: unsupported format.`)],
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            dispatch({ type: 'row-retry', rowId: row.id });
          } else {
            dispatch({ type: 'upload-failed', rowId: row.id, error: errorMessage(error, 'Upload failed') });
          }
        } finally {
          abortControllersRef.current.delete(key);
          inFlightRef.current.delete(key);
        }
      })();
    }

    const commitBatch = selectCommitBatch(state);
    if (commitBatch.length > 0) {
      const key = `commit:${commitBatch.join(',')}`;
      if (!inFlightRef.current.has(key)) {
        inFlightRef.current.add(key);
        dispatch({ type: 'commit-start', itemIds: commitBatch });
        void commitImportItems(state.sessionId, commitBatch)
          .then((response) =>
            dispatch({
              type: 'commit-result',
              itemIds: commitBatch,
              results: response.results,
              rateLimited: response.rateLimited,
            }),
          )
          .catch((error) =>
            dispatch({
              type: 'commit-failed',
              itemIds: commitBatch,
              error: errorMessage(error, "Couldn't save these notes"),
            }),
          )
          .finally(() => inFlightRef.current.delete(key));
      }
    }

    const enrichBatch = selectEnrichBatch(state);
    if (enrichBatch.length > 0) {
      const key = `enrich:${enrichBatch.join(',')}`;
      if (!inFlightRef.current.has(key)) {
        inFlightRef.current.add(key);
        dispatch({ type: 'enrich-start', itemIds: enrichBatch });
        void enrichImportItems(state.sessionId, enrichBatch)
          .then(() => dispatch({ type: 'enrich-result', itemIds: enrichBatch }))
          .catch(() => dispatch({ type: 'enrich-failed', itemIds: enrichBatch }))
          .finally(() => inFlightRef.current.delete(key));
      }
    }
  }, [state]);

  // Wake the pump when a rate-limit window expires — nothing else would re-render.
  useEffect(() => {
    if (state.rateLimitedUntil == null) return;
    const delay = Math.max(0, state.rateLimitedUntil - Date.now());
    const timer = window.setTimeout(() => dispatch({ type: 'clear-rate-limit' }), delay + 250);
    return () => window.clearTimeout(timer);
  }, [state.rateLimitedUntil]);

  const runComplete = selectIsRunComplete(state);
  useEffect(() => {
    if (!runComplete || state.finalized || !state.sessionId) return;
    const key = 'finalize';
    if (inFlightRef.current.has(key)) return;
    inFlightRef.current.add(key);
    void finalizeImportSession(state.sessionId)
      .then((response) => {
        dispatch({
          type: 'finalized',
          summary: {
            notesImported: response.summary.notesImported,
            duplicatesSkipped: response.summary.duplicatesSkipped,
            highlightsImported: response.summary.highlightsImported,
            connectionsImported: response.summary.connectionsImported,
            scriptureProcessed: response.summary.scriptureProcessed,
            autoTagsApplied: response.summary.autoTagsApplied,
          },
        });
        try {
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch {
          /* nothing to clean up */
        }
        void refreshClientData(queryClient);
      })
      .catch((error) => setFatalError(errorMessage(error, "Couldn't finish the import")))
      .finally(() => inFlightRef.current.delete(key));
  }, [runComplete, state.finalized, state.sessionId, queryClient]);

  const startImport = useCallback(() => {
    setFatalError(null);
    dispatch({ type: 'start-import' });
  }, []);

  const pause = useCallback(() => {
    for (const controller of abortControllersRef.current.values()) controller.abort();
    abortControllersRef.current.clear();
    dispatch({ type: 'pause' });
  }, []);

  const resume = useCallback(() => dispatch({ type: 'resume' }), []);

  const toggleInclude = useCallback(
    (rowId: string, included: boolean) => {
      dispatch({ type: 'toggle-include', rowId, included });
      const row = stateRef.current.rows.find((r) => r.id === rowId);
      if (stateRef.current.sessionId && row && row.itemIds.length > 0) {
        void setImportItemsIncluded(stateRef.current.sessionId, row.itemIds, included).catch(() => {
          /* the client copy is authoritative for what gets committed */
        });
      }
    },
    [],
  );

  const setAllIncluded = useCallback((included: boolean) => {
    dispatch({ type: 'set-all-included', included });
    const { sessionId, rows } = stateRef.current;
    const itemIds = rows.filter((row) => row.phase === 'parsed').flatMap((row) => row.itemIds);
    if (sessionId && itemIds.length > 0) {
      void setImportItemsIncluded(sessionId, itemIds, included).catch(() => {});
    }
  }, []);

  const removeRow = useCallback((rowId: string) => {
    sourcesRef.current.delete(rowId);
    dispatch({ type: 'row-remove', rowId });
  }, []);

  const retryRow = useCallback((rowId: string) => dispatch({ type: 'row-retry', rowId }), []);

  const undoImport = useCallback(async () => {
    const sessionId = stateRef.current.sessionId;
    if (!sessionId) return null;
    const result = await discardImportSession(sessionId);
    void refreshClientData(queryClient);
    sourcesRef.current.clear();
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
    dispatch({ type: 'reset' });
    return result;
  }, [queryClient]);

  const reset = useCallback(() => {
    sourcesRef.current.clear();
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
    dispatch({ type: 'reset' });
  }, []);

  const derived = useMemo(
    () => ({
      phase: selectContainerPhase(state),
      counts: selectProgressCounts(state),
      readyItemCount: selectReadyItemCount(state),
    }),
    [state],
  );

  return {
    state,
    ...derived,
    fatalError,
    addFromDataTransfer,
    addFromFileList,
        startImport,
    pause,
    resume,
    toggleInclude,
    setAllIncluded,
    removeRow,
    retryRow,
    undoImport,
    reset,
  };
}
