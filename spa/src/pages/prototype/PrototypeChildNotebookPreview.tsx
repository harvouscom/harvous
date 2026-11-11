import '../../styles/child-notebook-preview.css';
import { useClerk } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { clearUserClientStorageCaches } from '@/utils/clear-user-client-caches';
import { deletePersistedQueryCache } from '@/utils/query-cache-persistence';
import ChildNotebookView from './ChildNotebookView';
import ChildNotebookBibleReader from './ChildNotebookBibleReader';
import { usePrototypeBibleChapter } from '../../hooks/queries/usePrototypeBibleChapter';
import PrototypeReaderChapterStack from './PrototypeReaderChapterStack';
import ChildNoteAttachmentPicker from './ChildNoteAttachmentPicker';

export default function PrototypeChildNotebookPreview() {
  const clerk = useClerk();
  const queryClient = useQueryClient();
  return <ChildNotebookView
    preview
    renderBible={props => <ChildNotebookBibleReader {...props} useChapter={usePrototypeBibleChapter}
      renderEdge={(book, chapter, translation, direction, onSelect) => <PrototypeReaderChapterStack
        book={book} chapter={chapter} translation={translation} direction={direction} onSelect={onSelect} />} />}
    renderAttachment={props => <ChildNoteAttachmentPicker {...props} useChapter={usePrototypeBibleChapter} />}
    onParentSignIn={async () => {
      await queryClient.cancelQueries();
      clearUserClientStorageCaches();
      await deletePersistedQueryCache();
      await clerk.signOut();
      queryClient.clear();
      window.location.assign('/sign-in?redirect_url=%2Fsettings%2Fchild-accounts');
    }}
  />;
}
