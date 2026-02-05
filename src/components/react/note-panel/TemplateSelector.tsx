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
    <div className="relative mb-3" ref={dropdownRef}>
      {/* Trigger Button - matches SpaceSelector styling */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="space-button relative rounded-3xl h-[64px] transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
        style={{ backgroundImage: 'var(--color-gradient-gray)' }}
        type="button"
      >
        <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125">
          <span
            className="font-sans text-[18px] font-semibold whitespace-nowrap"
            style={{ color: 'var(--color-deep-grey)' }}
          >
            {displayName}
          </span>
          <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
            <Icon
              name={isOpen ? 'caret-up' : 'caret-down'}
              size={16}
              style={{ color: 'var(--color-deep-grey)' }}
            />
          </div>
        </div>
      </button>

      {/* Backdrop (click outside to close) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Dropdown Panel - matches ThreadCombobox styling */}
      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl border max-h-[300px] overflow-hidden flex flex-col"
          style={{
            backgroundColor: 'var(--color-snow-white)',
            borderColor: 'var(--color-fog-white)'
          }}
        >
          {/* Blank Note option */}
          <button
            onClick={handleSelectBlank}
            className="flex items-center justify-between w-full px-4 py-3 h-12 rounded-xl transition-colors"
            style={{
              backgroundColor: selectedTemplateId === null ? 'oklch(var(--lch-bold-blue) / 0.1)' : 'transparent',
              color: selectedTemplateId === null ? 'var(--color-bold-blue)' : 'var(--color-deep-grey)'
            }}
            onMouseEnter={(e) => {
              if (selectedTemplateId !== null) {
                e.currentTarget.style.backgroundColor = 'oklch(var(--lch-snow-white) / 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedTemplateId !== null) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
            type="button"
          >
            <span className="text-base font-medium">Blank Note</span>
            {selectedTemplateId === null && (
              <Icon name="check" size={16} style={{ color: 'var(--color-bold-blue)' }} />
            )}
          </button>

          {/* Template list - name only, no divider, no metadata */}
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleSelectTemplate(template.id)}
              className="flex items-center justify-between w-full px-4 py-3 h-12 rounded-xl transition-colors"
              style={{
                backgroundColor: selectedTemplateId === template.id ? 'oklch(var(--lch-bold-blue) / 0.1)' : 'transparent',
                color: selectedTemplateId === template.id ? 'var(--color-bold-blue)' : 'var(--color-deep-grey)'
              }}
              onMouseEnter={(e) => {
                if (selectedTemplateId !== template.id) {
                  e.currentTarget.style.backgroundColor = 'oklch(var(--lch-snow-white) / 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedTemplateId !== template.id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
              type="button"
            >
              <span className="text-base font-medium">{template.name}</span>
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
