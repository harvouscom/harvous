import { useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { alertCreateNoteFailure, useCreateSimpleNote } from '../../hooks/mutations/useCreateSimpleNote';
import { getNoteIdFromCreateResponse, seedNoteFromCreateResponse } from '../../hooks/queries/useNote';
import { useProtoShell } from '../../layouts/proto-shell-context';

function noteParamSlug(id: string) {
  return id.startsWith('note_') ? id.slice('note_'.length) : id;
}

function spaceParamSlug(id: string) {
  return id.startsWith('space_') ? id.slice('space_'.length) : id;
}

export default function PrototypeSpaceIndexPage() {
  const { spaceId: spaceSlugParam } = useParams({ strict: false }) as { spaceId: string };
  const spaceId = spaceSlugParam.startsWith('space_') ? spaceSlugParam : `space_${spaceSlugParam}`;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createNote = useCreateSimpleNote();
  const { isMobileSidebar, closeDrawer } = useProtoShell();

  const onNewNote = () => {
    if (createNote.isPending) return;
    createNote.mutate(
      { spaceId },
      {
        onSuccess: (res) => {
          const nid = getNoteIdFromCreateResponse(res);
          const note = res?.note;
          if (note && typeof note === 'object' && nid) {
            try {
              seedNoteFromCreateResponse(queryClient, note as Record<string, unknown> & { id: string }, spaceId);
            } catch (e) {
              console.error('[PrototypeSpaceIndexPage] seedNoteFromCreateResponse:', e);
            }
          }
          if (nid) {
            if (isMobileSidebar) closeDrawer();
            navigate({
              to: '/prototype/space/$spaceId/n/$noteId',
              params: { spaceId: spaceParamSlug(spaceId), noteId: noteParamSlug(nid) },
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

  return (
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
  );
}
