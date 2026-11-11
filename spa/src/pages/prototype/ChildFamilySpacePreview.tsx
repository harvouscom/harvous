import { useRef, type Ref } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { useChildNotebookAppearance } from './ChildNotebookAppearance';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeSharedSpaceHeader from './PrototypeSharedSpaceHeader';
import '../../styles/prototype-shared-threads.css';

const familySpace = { color: 'blue' };
const threadTitle = 'Read together';

export default function ChildFamilySpacePreview({
  threadOpen,
  headingRef,
  resource,
  onOpenThread,
  onBackToSpace,
  onOpenReading,
  onOpenBible
}: {
  threadOpen: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  resource: { title: string; source: string };
  onOpenThread: () => void;
  onBackToSpace: () => void;
  onOpenReading: () => void;
  onOpenBible: () => void;
}) {
  const { resolvedScheme, themeStyle, playCue } = useChildNotebookAppearance();
  const aboutRef = useRef<HTMLDialogElement>(null);

  function openAbout() {
    playCue('nav.open');
    aboutRef.current?.showModal();
  }

  return (
    <div className="proto-hub-frame">
      <article className="proto-feed-sheet proto-shared-space-dashboard proto-shared-space-dashboard--sheet">
        {threadOpen ? (
          <>
            <div className="proto-shared-thread-drilldown__header">
              <div className="proto-shared-thread-drilldown__identity">
                <button type="button" className="proto-shared-space-header__church-icon proto-sidebar-back-tile" onClick={onBackToSpace} aria-label="Back to Family Space">
                  <Icon name="caret-left" size={16} aria-hidden />
                </button>
                <div className="proto-shared-thread-drilldown__meta">
                  <h1 ref={headingRef} tabIndex={-1} className="pds-list-title proto-shared-thread-drilldown__title">{threadTitle}</h1>
                  <p className="proto-caption proto-shared-thread-drilldown__status">Current Thread</p>
                </div>
              </div>
            </div>
            <div className="proto-sidebar-scroll proto-shared-thread-drilldown__scroll">
              <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel">
                <PrototypeHomeRow icon="book-open" title={resource.title} meta={[resource.source, 'Shared by your family']} onClick={onOpenReading} />
              </div>
            </div>
          </>
        ) : (
          <>
            <PrototypeSharedSpaceHeader
              space={familySpace}
              title="Family Space"
              headingRef={headingRef}
              colorScheme={resolvedScheme}
              people={<p className="proto-caption proto-shared-space-header__location">Shared with your family</p>}
              actions={(
                <button type="button" className="proto-toolbar-icon-btn" aria-label="About this space" title="About this space" onClick={openAbout}>
                  <Icon name="circle-info" size={15} aria-hidden />
                </button>
              )}
            />
            <div className="proto-sidebar-scroll">
              <div className="proto-home-view">
                <PrototypeHomeSection title="Current Thread">
                  <PrototypeHomeRow icon="arrow-right-arrow-left" title={threadTitle} meta={['1 reading']} onClick={onOpenThread} />
                </PrototypeHomeSection>
                <PrototypeHomeSection title="Scripture">
                  <PrototypeHomeRow icon="book-open" title="Family Bible" meta={['Psalm 23', 'Read together']} onClick={onOpenBible} />
                </PrototypeHomeSection>
              </div>
            </div>
          </>
        )}
      </article>
      {createPortal(
        <dialog ref={aboutRef} className="pds-kids-privacy-modal proto-theme" style={themeStyle} aria-labelledby="child-family-about-title" aria-describedby="child-family-about-description">
          <div className="pds-kids-privacy-modal__heading">
            <span className="pds-kids-review__art" aria-hidden><Icon name="user-group" size={22} /></span>
            <button type="button" className="proto-toolbar-icon-btn" aria-label="Close about Family Space" onClick={() => aboutRef.current?.close()}>
              <Icon name="xmark" size={16} />
            </button>
          </div>
          <h2 id="child-family-about-title" className="pds-title">About Family Space</h2>
          <p id="child-family-about-description" className="pds-caption">Read together in Family Bible and find readings your family has shared here.</p>
        </dialog>,
        document.body
      )}
    </div>
  );
}
