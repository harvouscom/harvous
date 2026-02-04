import React, { useState, useEffect } from 'react';
import { getBuiltInTemplates, type NoteTemplate } from '@/data/note-templates';
import { captureEvent } from '@/utils/posthog';

interface NoteTemplatePickerProps {
  onSelectTemplate: (templateId: string) => void;
  onStartBlank: () => void;
  onClose?: () => void;
}

export default function NoteTemplatePicker({
  onSelectTemplate,
  onStartBlank,
  onClose
}: NoteTemplatePickerProps) {
  const templates = getBuiltInTemplates();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Track when picker is shown
  useEffect(() => {
    captureEvent('note_template_picker_shown', {
      templates_count: templates.length
    });
  }, []); // Only run once on mount

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);

    // Track template selection
    captureEvent('note_template_selected', {
      template_id: templateId,
      template_name: template?.name,
      estimated_minutes: template?.estimatedMinutes,
      level: template?.level,
      note_type: template?.noteType
    });

    onSelectTemplate(templateId);
  };

  const handleStartBlank = () => {
    // Track when user chooses blank note
    captureEvent('note_template_blank_selected', {
      picker_shown: true
    });

    onStartBlank();
  };

  return (
    <div className="template-picker">
      {/* Header */}
      <div className="template-picker__header">
        <h2>Create Note</h2>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="template-picker__close">
            ×
          </button>
        )}
      </div>

      {/* Blank option */}
      <button
        className="template-option template-option--blank"
        onClick={handleStartBlank}
      >
        <div className="template-option__icon">📝</div>
        <div className="template-option__content">
          <h3>Start from Blank</h3>
          <p>Create a note from scratch</p>
        </div>
      </button>

      {/* Divider */}
      <div className="template-picker__divider">
        <span>Or choose a study method</span>
      </div>

      {/* Template list */}
      <div className="template-list">
        {templates.map((template) => (
          <button
            key={template.id}
            className={`template-option ${hoveredId === template.id ? 'template-option--hover' : ''}`}
            onClick={() => handleTemplateSelect(template.id)}
            onMouseEnter={() => setHoveredId(template.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div className="template-option__content">
              <h3>{template.name}</h3>
              <p>{template.description}</p>
              <div className="template-option__meta">
                <span className="template-badge">{template.estimatedMinutes}</span>
                <span className="template-badge">{template.level}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
