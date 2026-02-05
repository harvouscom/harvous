import React from 'react';
import { getBuiltInTemplates } from '@/data/note-templates';

/**
 * TemplatesPanel - Displays all available note templates
 * Allows users to browse and preview built-in study method templates
 */
export default function TemplatesPanel() {
  const templates = getBuiltInTemplates();

  const handleTemplateClick = (templateId: string) => {
    // Store the selected template in localStorage
    localStorage.setItem('newNoteTemplateId', templateId);

    // Close this panel
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));

    // Open new note panel with the template pre-selected
    window.dispatchEvent(new CustomEvent('openNewNote'));
  };

  return (
    <div className="panel-content h-full flex flex-col">
      {/* Header */}
      <div className="panel-header">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('closeProfilePanel'))}
          className="panel-back-button"
          aria-label="Close"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h2 className="panel-title">Note Templates</h2>
      </div>

      {/* Description */}
      <div className="px-6 pt-4 pb-2">
        <p className="text-[16px] leading-relaxed" style={{ color: 'var(--color-stone-grey)' }}>
          Browse study method templates to structure your Bible study notes.
        </p>
      </div>

      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="space-y-3">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateClick(template.id)}
              className="template-card w-full text-left"
              style={{
                background: 'var(--color-white)',
                border: '1px solid var(--color-soft-gray)',
                borderRadius: '16px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'oklch(var(--lch-snow-white) / 0.5)';
                e.currentTarget.style.borderColor = 'var(--color-bold-blue)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-white)';
                e.currentTarget.style.borderColor = 'var(--color-soft-gray)';
              }}
            >
              {/* Template Name */}
              <h3
                className="text-[18px] font-semibold mb-1"
                style={{ color: 'var(--color-deep-grey)' }}
              >
                {template.name}
              </h3>

              {/* Template Description */}
              <p
                className="text-[14px] mb-2"
                style={{ color: 'var(--color-stone-grey)' }}
              >
                {template.description}
              </p>

              {/* Template Metadata */}
              <div className="flex gap-2 flex-wrap">
                <span
                  className="template-badge"
                  style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    background: 'var(--color-fog-white)',
                    color: 'var(--color-stone-grey)',
                    fontSize: '12px',
                    fontWeight: 500,
                    borderRadius: '4px',
                  }}
                >
                  {template.estimatedMinutes}
                </span>
                <span
                  className="template-badge"
                  style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    background: 'var(--color-fog-white)',
                    color: 'var(--color-stone-grey)',
                    fontSize: '12px',
                    fontWeight: 500,
                    borderRadius: '4px',
                  }}
                >
                  {template.level}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
