/**
 * Templates section for the note inspector (right side panel).
 * Browse/apply opens a Connect-note-style dialog/sheet; save stays inline.
 */
import { useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useCreateNoteTemplate } from '../../hooks/mutations/useCreateNoteTemplate';
import type { ApplyableNoteTemplate } from '../../hooks/queries/useNoteTemplates';
import { PrototypeSectionHeader } from './design-system';
import PrototypeBrowseTemplatesSheet from './PrototypeBrowseTemplatesSheet';

export type PrototypeInspectorTemplatesSectionProps = {
  spaceId?: string | null;
  spaceTitle?: string | null;
  canAttachToSpace?: boolean;
  showSpaceAttachOption?: boolean;
  isEmpty: boolean;
  liveTitle: string;
  liveContent: string;
  noteType?: string | null;
  onApply: (template: ApplyableNoteTemplate) => void;
};

export default function PrototypeInspectorTemplatesSection({
  spaceId,
  spaceTitle = null,
  canAttachToSpace = false,
  showSpaceAttachOption = false,
  isEmpty,
  liveTitle,
  liveContent,
  noteType,
  onApply,
}: PrototypeInspectorTemplatesSectionProps) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [attachToSpace, setAttachToSpace] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const createTemplate = useCreateNoteTemplate();
  const listSpaceId = spaceId?.trim() || null;

  const openBrowse = () => {
    setSaveOpen(false);
    setBrowseOpen(true);
  };

  const openSave = () => {
    setBrowseOpen(false);
    setTemplateName(liveTitle.trim() || 'Untitled template');
    setAttachToSpace(false);
    setSaveOpen(true);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  const handleSave = async () => {
    const name = templateName.trim();
    if (!name) {
      toast.error('Name this template first');
      return;
    }
    if (!liveContent.trim()) {
      toast.error('Write something before saving a template');
      return;
    }
    try {
      await createTemplate.mutateAsync({
        name,
        title: liveTitle,
        content: liveContent,
        noteType: noteType ?? 'default',
        spaceId: attachToSpace && canAttachToSpace && listSpaceId ? listSpaceId : null,
      });
      setSaveOpen(false);
      toast.success(attachToSpace && canAttachToSpace ? 'Saved as a space template' : 'Saved as a template');
    } catch (err) {
      const msg =
        err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not save template';
      toast.error(msg);
    }
  };

  return (
    <section className="proto-inspector-section">
      <PrototypeSectionHeader>Templates</PrototypeSectionHeader>

      {!saveOpen ? (
        <div className="proto-inspector-templates__actions">
          {isEmpty ? (
            <button type="button" className="proto-inspector-templates__action" onClick={openBrowse}>
              <Icon name="list-check" size={12} aria-hidden />
              Start from a template
            </button>
          ) : (
            <button type="button" className="proto-inspector-templates__action" onClick={openSave}>
              <Icon name="list-check" size={12} aria-hidden />
              Save as template
            </button>
          )}
          {!isEmpty ? (
            <button type="button" className="proto-inspector-templates__action-secondary" onClick={openBrowse}>
              Browse templates
            </button>
          ) : null}
        </div>
      ) : (
        <div className="proto-inspector-templates__panel">
          <div className="proto-inspector-templates__panel-header">
            <p className="proto-inspector-muted" style={{ margin: 0 }}>
              Save as template
            </p>
            <button
              type="button"
              className="proto-inspector-templates__close"
              onClick={() => setSaveOpen(false)}
              aria-label="Cancel save template"
            >
              <Icon name="xmark" size={11} aria-hidden />
            </button>
          </div>
          <label className="proto-inspector-templates__field">
            <span className="pds-caption">Template name</span>
            <input
              ref={nameInputRef}
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              maxLength={80}
            />
          </label>
          {showSpaceAttachOption && canAttachToSpace && listSpaceId ? (
            <label className="proto-inspector-templates__check">
              <input
                type="checkbox"
                checked={attachToSpace}
                onChange={(e) => setAttachToSpace(e.target.checked)}
              />
              <span className="pds-caption">Make available in this space</span>
            </label>
          ) : null}
          <div className="proto-inspector-templates__save-actions">
            <button
              type="button"
              className="proto-inspector-templates__action-secondary"
              onClick={() => setSaveOpen(false)}
              disabled={createTemplate.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="proto-inspector-templates__action"
              onClick={() => void handleSave()}
              disabled={createTemplate.isPending}
            >
              <Icon name="list-check" size={12} aria-hidden />
              {createTemplate.isPending ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>
      )}

      <PrototypeBrowseTemplatesSheet
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        spaceId={spaceId}
        spaceTitle={spaceTitle}
        showSpaceSection={showSpaceAttachOption}
        onApply={onApply}
        placement="main-column-top-right"
      />
    </section>
  );
}
