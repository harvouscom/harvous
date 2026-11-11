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
import { ChildFamilyThoughtForm, ChildFamilyThoughts } from './ChildFamilyThoughts';
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
          <nav className="pds-family-reader__nav" aria-label="Family Bible navigation">
            <span className="pds-caption">Family Bible{child ? ` · With ${child.displayName}` : ''}</span>
            <Link className="proto-settings-btn proto-settings-btn--secondary" to={prototypeHref('settings/child-accounts')}
              search={{ child: childId }}><Icon name="gear" size={13} aria-hidden /> Notebook settings</Link>
          </nav>
          {!ready || status.isPending || (child && reading.isPending) ? <ProtoSpaceLoading label="Opening Family Bible" />
            : !child || !chapter || reading.isError ? <p className="pds-body" role="alert">This shared reading is unavailable.</p>
            : <>
              <header className="pds-reader__chapter-heading">
                <h1 className="pds-reader-chapter-title">{chapter.book === 'Psalms' ? 'Psalm' : chapter.book} {chapter.chapter}</h1>
                <span className="scripture-pill-chrome__trans-chip" title={getTranslation(chapter.translation)?.name}>{chapter.translation}</span>
              </header>
              <div className="pds-reader__verses">
                {chapter.verses.map(verse => {
                  const thoughts = chapter.thoughts.filter(thought => thought.verse === verse.verse);
                  const expanded = openVerse === verse.verse;
                  return <div className="pds-reader__block" key={verse.verse}>
                    <p className="pds-reader-text">
                      <button className="pds-reader__verse" type="button" aria-expanded={expanded}
                        data-selected={expanded ? 'true' : undefined} disabled={save.isPending}
                        onClick={() => { save.reset(); setOpenVerse(expanded ? null : verse.verse); }}>
                        <sup className="pds-reader-verse-num">{verse.verse}</sup>{' '}
                        <span className="pds-reader__verse-text">{verse.text}</span>
                      </button>
                    </p>
                    {!expanded && thoughts.length > 0 && <button type="button" className="proto-settings-btn proto-settings-btn--secondary pds-family-reader__thought-count"
                      disabled={save.isPending} onClick={() => { save.reset(); setOpenVerse(verse.verse); }}>
                      {thoughts.length} {thoughts.length === 1 ? 'family thought' : 'family thoughts'}
                    </button>}
                    {expanded && <section className="pds-family-reader__discussion" aria-label={`Family thoughts on verse ${verse.verse}`}>
                      <h2 className="pds-list-title">Family thoughts</h2>
                      <ChildFamilyThoughts thoughts={thoughts} childName={child.displayName} preferences={child.notebookPreferences} />
                      {canWrite && <ChildFamilyThoughtForm disabled={save.isPending} onSave={async text => {
                        try { await save.mutateAsync({ verse: verse.verse, text: text.trim() }); return true; }
                        catch { return false; }
                      }} />}
                      {save.isError && <p className="pds-caption" role="alert">Couldn’t save your thought. Please try again.</p>}
                    </section>}
                  </div>;
                })}
              </div>
            </>}
        </article>
      </div>
    </section>
  </PrototypeMainPaneShell>;
}
