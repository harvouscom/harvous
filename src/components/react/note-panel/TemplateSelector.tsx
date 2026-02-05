import React, { useState, useEffect, useRef } from 'react';
import { getBuiltInTemplates, getTemplateById } from '@/data/note-templates';
import Icon from '@/components/react/Icon';
import { captureEvent } from '@/utils/posthog';

interface TemplateSelectorProps {
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string | null) => void;
}

export default function TemplateSelector({
  selectedTemplateId,
  onSelectTemplate
}: TemplateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const templates = getBuiltInTemplates();

  // Get selected template or default to blank
  const selectedTemplate = selectedTemplateId
    ? getTemplateById(selectedTemplateId)
    : null;

  const displayName = selectedTemplate?.name || 'Blank Note';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectTemplate = (templateId: string) => {
    const template = getTemplateById(templateId);

    // Track template selection
    captureEvent('note_template_selected', {
      template_id: templateId,
      template_name: template?.name,
      estimated_minutes: template?.estimatedMinutes,
      level: template?.level,
      note_type: template?.noteType
    });

    onSelectTemplate(templateId);
    setIsOpen(false);
  };

  const handleSelectBlank = () => {
    // Track when user chooses blank note
    captureEvent('note_template_blank_selected', {
      from_dropdown: true
    });

    onSelectTemplate(null);
    setIsOpen(false);
  };

  return (
    <div className="template-selector" ref={dropdownRef}>
      {/* Trigger Button (64px height, same as SpaceSelector) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="template-selector-trigger"
        type="button"
      >
        <span>{displayName}</span>
        <Icon
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          style={{ color: 'var(--color-deep-grey)' }}
        />
      </button>

      {/* Dropdown Panel (when isOpen) */}
      {isOpen && (
        <div className="template-dropdown">
          {/* Blank option first */}
          <button
            onClick={handleSelectBlank}
            className={`template-dropdown-option ${selectedTemplateId === null ? 'selected' : ''}`}
            type="button"
          >
            <span>Blank Note</span>
            {selectedTemplateId === null && (
              <Icon name="check" size={16} style={{ color: 'var(--color-bold-blue)' }} />
            )}
          </button>

          {/* Divider */}
          <div className="template-divider">Study Methods</div>

          {/* Template list */}
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleSelectTemplate(template.id)}
              className={`template-dropdown-option ${selectedTemplateId === template.id ? 'selected' : ''}`}
              type="button"
            >
              <div className="template-dropdown-content">
                <div className="template-name">{template.name}</div>
                <div className="template-meta">
                  {template.estimatedMinutes} · {template.level}
                </div>
              </div>
              {selectedTemplateId === template.id && (
                <Icon name="check" size={16} style={{ color: 'var(--color-bold-blue)' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
