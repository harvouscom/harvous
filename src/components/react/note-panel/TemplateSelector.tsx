import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getBuiltInTemplates, getTemplateById } from '@/data/note-templates';
import Icon from '@/components/react/Icon';
import { captureEvent } from '@/utils/posthog';

export interface TemplateSelectorDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRect: DOMRect | null;
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string | null) => void;
}

/**
 * TemplateSelectorDropdown - Dropdown panel only (no trigger).
 * Renders via portal to document.body. Styling matches SpaceSwitcherDropdown
 * (space-switcher-dropdown__panel, space-switcher-dropdown__item) for consistency.
 */
export default function TemplateSelector({
  isOpen,
  onClose,
  anchorRect,
  selectedTemplateId,
  onSelectTemplate
}: TemplateSelectorDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const templates = getBuiltInTemplates();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const targetEl = target as unknown as HTMLElement;
      if (targetEl?.closest?.('.note-template-header')) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, onClose]);

  const handleSelectTemplate = (templateId: string) => {
    const template = getTemplateById(templateId);
    captureEvent('note_template_selected', {
      template_id: templateId,
      template_name: template?.name,
      estimated_minutes: template?.estimatedMinutes,
      level: template?.level,
      note_type: template?.noteType
    });
    onSelectTemplate(templateId);
    onClose();
  };

  const handleSelectBlank = () => {
    captureEvent('note_template_blank_selected', { from_dropdown: true });
    onSelectTemplate(null);
    onClose();
  };

  if (!isOpen || typeof document === 'undefined' || !anchorRect) {
    return null;
  }

  const width = Math.max(260, anchorRect.width);
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 16);
  const left = Math.max(16, Math.min(anchorRect.left, window.innerWidth - width - 16));

  return createPortal(
    <div
      ref={dropdownRef}
      className="space-switcher-dropdown template-selector-dropdown"
      style={{
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 1000000
      }}
      role="dialog"
      aria-label="Select note template"
    >
      <div className="space-switcher-dropdown__panel">
        <button
          type="button"
          className={`space-switcher-dropdown__item ${selectedTemplateId === null ? 'is-active' : ''}`}
          onClick={handleSelectBlank}
        >
          <span className="space-switcher-dropdown__label">Blank Note</span>
          <span className="space-switcher-dropdown__icon-slot" aria-hidden="true">
            {selectedTemplateId === null ? (
              <span className="space-switcher-dropdown__check" aria-hidden="true">
                <Icon name="check" size={20} style={{ color: 'var(--color-deep-grey)' }} />
              </span>
            ) : null}
          </span>
        </button>

        {templates.map((template) => {
          const isActive = selectedTemplateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              className={`space-switcher-dropdown__item ${isActive ? 'is-active' : ''}`}
              onClick={() => handleSelectTemplate(template.id)}
            >
              <span className="space-switcher-dropdown__label">{template.name}</span>
              <span className="space-switcher-dropdown__icon-slot" aria-hidden="true">
                {isActive ? (
                  <span className="space-switcher-dropdown__check" aria-hidden="true">
                    <Icon name="check" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
