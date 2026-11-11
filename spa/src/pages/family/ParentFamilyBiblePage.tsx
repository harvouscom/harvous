import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { getTranslation } from '@/data/translations';
import { prototypeHref } from '@/lib/prototype-path';
import type { ChildFamilyChapter, ChildFamilyThought } from '../../../../shared/child-notebook';
import { useAuthReady } from '../../hooks/useAuthReady';
import { api } from '../../lib/api';
import PrototypeMainPaneShell from '../prototype/PrototypeMainPaneShell';
import ProtoSpaceLoading from '../prototype/ProtoSpaceLoading';
import { ChildNotebookProfileAvatar } from '../prototype/ChildNotebookAppearance';
import FamilyVerseDiscussion from './FamilyVerseDiscussion';
import { useChildAccountsStatus } from './useChildAccountsStatus';
import '../../styles/family.css';
import '../../styles/child-notebook-preview.css';

export default function ParentFamilyBiblePage() {
  const { childId, readingId } = useParams({ strict: false }) as { childId: string; readingId: string };
  return <SharedChapter key={`${childId}:${readingId}`} childId={childId} readingId={readingId} />;
}

function SharedChapter({ childId, readingId }: { childId: string; readingId: string }) {
  const { userId } = useAuth();
  const ready = useAuthReady();
  const status = useChildAccountsStatus();
  const child = status.data?.children.find(entry => entry.id === childId);
  const queryClient = useQueryClient();
  const queryKey = ['parent-family-reading', userId, childId, readingId] as const;
  const endpoint = `/api/child-accounts/children/${encodeURIComponent(childId)}/bible/readings/${encodeURIComponent(readingId)}`;
  const reading = useQuery({
    queryKey,
    enabled: ready && !!child,
    meta: { persist: false },
    retry: false,
    gcTime: 0,
    queryFn: () => api.get<ChildFamilyChapter>(endpoint),
  });
  const [openVerse, setOpenVerse] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: ({ verse, text }: { verse: number; text: string }) =>
      api.post<{ thought: ChildFamilyThought }>(`${endpoint}/thoughts`, { verse, text }),
    onSuccess: ({ thought }) => {
      queryClient.setQueryData<ChildFamilyChapter>(queryKey, current => current && {
        ...current,
        thoughts: current.thoughts.some(item => item.id === thought.id) ? current.thoughts : [...current.thoughts, thought],
      });
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });
  const chapter = reading.data;
  const canWrite = child?.status === 'active' && chapter && child.bibleTranslations.includes(chapter.translation);
  return <PrototypeMainPaneShell>
    <section className="pds-reader pds-family-reader" aria-label="Family Bible">
      <div className="pds-reader__scroll pds-reader-stack">
        <article className="pds-reader__column">
          <div className="pds-family-reader__context">
            <div className="pds-family-reader__identity">
              {child && <ChildNotebookProfileAvatar name={child.displayName} preferences={child.notebookPreferences} small />}
              <div>
                <p className="pds-caption">Family Bible</p>
                {child && <p className="pds-list-title">Read with {child.displayName}</p>}
              </div>
            </div>
            <Link className="proto-toolbar-icon-btn" to={prototypeHref('settings/child-accounts')}
              search={{ child: childId }} aria-label="Notebook settings" title="Notebook settings">
              <Icon name="gear" size={14} aria-hidden />
            </Link>
          </div>
          {!ready || status.isPending || (child && reading.isPending) ? <ProtoSpaceLoading label="Opening Family Bible" />
            : !child || !chapter || reading.isError ? <p className="pds-body" role="alert">This shared reading is unavailable.</p>
            : <>
              <header className="pds-reader__chapter-heading pds-family-reader__heading">
                <h1 className="pds-reader-chapter-title">{chapter.book === 'Psalms' ? 'Psalm' : chapter.book} {chapter.chapter}</h1>
                <span className="scripture-pill-chrome__trans-chip" title={getTranslation(chapter.translation)?.name}>{chapter.translation}</span>
              </header>
              <div className="pds-reader__verses">
                {chapter.verses.map(verse => {
                  const thoughts = chapter.thoughts.filter(thought => thought.verse === verse.verse);
                  const expanded = openVerse === verse.verse;
                  const toggle = () => setOpenVerse(expanded ? null : verse.verse);
                  return <div className="pds-reader__block" key={verse.verse}>
                    <p className="pds-reader-text">
                      <button className="pds-reader__verse" type="button" aria-expanded={expanded}
                        disabled={save.isPending} onClick={toggle}>
                        <sup className="pds-reader-verse-num">{verse.verse}</sup>{' '}
                        <span className="pds-reader__verse-text">{verse.text}</span>
                      </button>
                    </p>
                    <FamilyVerseDiscussion verse={verse.verse} comments={thoughts} viewer="parent" childName={child.displayName}
                      preferences={child.notebookPreferences} expanded={expanded} onToggle={toggle} disabled={save.isPending}
                      onSave={canWrite ? async text => { await save.mutateAsync({ verse: verse.verse, text }); } : undefined} />
                  </div>;
                })}
              </div>
            </>}
        </article>
      </div>
    </section>
  </PrototypeMainPaneShell>;
}
