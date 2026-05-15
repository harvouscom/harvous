import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import {
  alertCreateNoteFailure,
  useCreateSimpleNote,
} from '../../hooks/mutations/useCreateSimpleNote';
import { getNoteIdFromCreateResponse, seedNoteFromCreateResponse } from '../../hooks/queries/useNote';
import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypeStandaloneScripturePassagePane from './PrototypeStandaloneScripturePassagePane';
import { noteParamSlug } from './proto-route-slugs';

export default function PrototypeHomePage() {
  const { homeSpaceId, navReady } = usePrototypeHomeSpaceId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createNote = useCreateSimpleNote();
  const { isMobileSidebar, closeDrawer, standaloneScripturePassage, dismissStandaloneScripturePassage } =
    useProtoShell();

  const onNewNote = () => {
    if (!homeSpaceId || createNote.isPending) return;
    createNote.mutate(
      { spaceId: homeSpaceId },
      {
        onSuccess: (res) => {
          const nid = getNoteIdFromCreateResponse(res);
          const note = res?.note;
          if (note && typeof note === 'object' && nid) {
            try {
              seedNoteFromCreateResponse(queryClient, note as Record<string, unknown> & { id: string }, homeSpaceId);
            } catch (e) {
              console.error('[PrototypeHomePage] seedNoteFromCreateResponse:', e);
            }
          }
          if (nid) {
            if (isMobileSidebar) closeDrawer();
            navigate({
              to: '/prototype/n/$noteId',
              params: { noteId: noteParamSlug(nid) },
            });
          } else {
            alert('Create succeeded but response had no note id.');
          }
        },
        onError: (err) => {
          alertCreateNoteFailure(err);
        },
      },
    );
  };

  if (!navReady) {
    return (
      <div className="proto-main-pane proto-main-empty">
        <p className="proto-caption">Loading…</p>
      </div>
    );
  }

  if (!homeSpaceId) {
    return (
      <div className="proto-main-pane proto-main-empty" style={{ maxWidth: 440 }}>
        <h1 className="proto-title-md" style={{ marginBottom: 8 }}>
          No home space yet
        </h1>
        <p className="proto-body" style={{ color: 'var(--proto-text-secondary)', marginBottom: 20 }}>
          Open the classic app to finish setup; My Home should appear for your account.
        </p>
        <Link
          to="/"
          className="proto-caption"
          style={{ color: 'var(--proto-accent)', fontWeight: 600, textDecoration: 'none' }}
        >
          Classic app →
        </Link>
      </div>
    );
  }

  if (standaloneScripturePassage) {
    return (
      <PrototypeMainPaneShell>
        <PrototypeStandaloneScripturePassagePane
          state={standaloneScripturePassage}
          onDone={dismissStandaloneScripturePassage}
        />
      </PrototypeMainPaneShell>
    );
  }

  return (
    <PrototypeMainPaneShell>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
          padding: 32,
          textAlign: 'center',
        }}
      >
        <p className="proto-title-md" style={{ marginBottom: 8 }}>
          Select a note
        </p>
        <p className="proto-caption" style={{ maxWidth: 320, marginBottom: 20 }}>
          Choose a note from the list, or create a new one.
        </p>
        <button
          type="button"
          className="proto-toolbar-icon-btn"
          style={{
            width: 'auto',
            height: 'auto',
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 600,
            gap: 8,
          }}
          disabled={createNote.isPending}
          onClick={onNewNote}
        >
          {createNote.isPending ? 'Creating…' : 'New note'}
        </button>
      </div>
    </PrototypeMainPaneShell>
  );
}
