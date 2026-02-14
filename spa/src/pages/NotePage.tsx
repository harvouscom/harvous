import { useParams } from '@tanstack/react-router';
import { useNote } from '../hooks/queries/useNote';
import CardFullEditable from '../../../src/components/react/CardFullEditable';
import { useNavigation } from '../hooks/queries/useNavigation';

export default function NotePage() {
  const { noteId } = useParams({ from: '/note/$noteId' });
  const { data: note, isLoading } = useNote(noteId);
  const { data: _nav } = useNavigation(); // kept warm for nav sidebar

  if (isLoading) {
    return <div className="page-loading" />;
  }

  if (!note) {
    return <div className="page-error">Note not found.</div>;
  }

  return (
    <CardFullEditable
      title={note.title ?? ''}
      content={note.content ?? ''}
      date={note.createdAt}
      noteId={noteId}
      noteType={note.type as 'default' | 'scripture' | 'resource'}
      isEditable={true}
      contentEncrypted={false}
    />
  );
}
