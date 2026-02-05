import React, { forwardRef } from 'react';
import Icon from '@/components/react/Icon';

interface NoteTemplateHeaderProps {
  selectedTemplateName: string;
  isOpen: boolean;
  onClick: () => void;
}

/**
 * NoteTemplateHeader - CardStack header that displays the selected note template name.
 * Clicking opens the template dropdown (handled by parent). Styled like thread title bars
 * but with the gray gradient used for template selector.
 */
const NoteTemplateHeader = forwardRef<HTMLDivElement, NoteTemplateHeaderProps>(function NoteTemplateHeader(
  { selectedTemplateName, isOpen, onClick },
  ref
) {
  return (
    <div
      ref={ref}
      className="card-stack__header note-template-header"
      data-template-header
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label="Switch template"
      aria-expanded={isOpen}
      style={{
        backgroundImage: 'var(--color-gradient-gray)',
        backgroundColor: 'transparent',
        color: 'var(--color-deep-grey)'
      }}
    >
      <div className="note-template-header__title-wrap">
        <div className="page-heading page-heading--center">
          <p>{selectedTemplateName}</p>
        </div>
      </div>
      <div className="note-template-header__caret" aria-hidden="true">
        <Icon
          name={isOpen ? 'caret-up' : 'caret-down'}
          size={20}
          style={{ color: 'var(--color-deep-grey)' }}
        />
      </div>
    </div>
  );
});

export default NoteTemplateHeader;
