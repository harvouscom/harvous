/**
 * Templates section for the note inspector (right side panel).
 * Browse/apply opens a Connect-note-style dialog/sheet; save/edit stays inline.
 */
import { useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH } from '@/data/note-templates';
import {
  NOTE_TEMPLATE_ICON_COLORS,
  NOTE_TEMPLATE_ICON_NAME,
  resolveNoteTemplateIconColor,
} from '@/utils/note-template-icon';
import { spacePickerSwatchColor } from '@/utils/space-cover';
import { APIError } from '../../lib/api';
import { useCreateNoteTemplate } from '../../hooks/mutations/useCreateNoteTemplate';
import { useUpdateNoteTemplate } from '../../hooks/mutations/useUpdateNoteTemplate';
import type { ApplyableNoteTemplate } from '../../hooks/queries/useNoteTemplates';
import { PrototypeSectionHeader } from './design-system';
import PrototypeBrowseTemplatesSheet, {
  type EditableNoteTemplate,
} from './PrototypeBrowseTemplatesSheet';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { offerGuestAccount } from '../../lib/guest-gate';

export type PrototypeInspectorTemplatesSectionProps = {
  spaceId?: string | null;
  spaceTitle?: string | null;
  canAttachToSpace?: boolean;
  showSpaceAttachOption?: boolean;
  /** Viewer's home church org — present only for connected staff. */
  churchOrgId?: string | null;
  /** Server's `manage_templates` verdict. Never re-derived from a role string. */
  canManageChurchTemplates?: boolean;
  isEmpty: boolean;
  liveTitle: string;
  liveContent: string;
  noteType?: string | null;
  startedFromTemplateId?: string | null;
  startedFromTemplateName?: string | null;
  onApply: (template: ApplyableNoteTemplate) => void;
  onTemplateProvenanceChange?: (provenance: { id: string; name: string }) => void;
};

export default function PrototypeInspectorTemplatesSection({
  spaceId,
  spaceTitle = null,
  canAttachToSpace = false,
  showSpaceAttachOption = false,
  churchOrgId = null,
  canManageChurchTemplates = false,
  isEmpty,
  liveTitle,
  liveContent,
  noteType,
  startedFromTemplateId = null,
  startedFromTemplateName = null,
  onApply,
  onTemplateProvenanceChange,
}: PrototypeInspectorTemplatesSectionProps) {
  const { clearComposePurpose } = useProtoShell();
  const { isGuest } = useHarvousIdentity();
  const [browseOpen, setBrowseOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [iconColor, setIconColor] = useState<string>(NOTE_TEMPLATE_ICON_COLORS[0]!);
  const [attachToSpace, setAttachToSpace] = useState(false);
  const [attachToChurch, setAttachToChurch] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const createTemplate = useCreateNoteTemplate();
  const updateTemplate = useUpdateNoteTemplate();
  const listSpaceId = spaceId?.trim() || null;
  const listOrgId = churchOrgId?.trim() || null;
  /** A starter is the church's, so provisioning one is gated on the capability. */
  const canChooseChurch = Boolean(canManageChurchTemplates && listOrgId);
  const isEditing = Boolean(editingTemplateId);
  const saving = createTemplate.isPending || updateTemplate.isPending;
  const provenanceId = startedFromTemplateId?.trim() || '';

  const closeSavePanel = () => {
    setSaveOpen(false);
    setEditingTemplateId(null);
  };

  const openBrowse = () => {
    closeSavePanel();
    setBrowseOpen(true);
  };

  const openSave = () => {
    setBrowseOpen(false);
    setEditingTemplateId(null);
    setTemplateName(liveTitle.trim() || 'Untitled template');
    setDescription('');
    setIconColor(NOTE_TEMPLATE_ICON_COLORS[0]!);
    setAttachToSpace(false);
    setAttachToChurch(false);
    setSaveOpen(true);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  const openEdit = (template: EditableNoteTemplate) => {
    setBrowseOpen(false);
    // Load template body into the open note/editor so the user can edit content in place.
    onApply({
      id: template.id,
      name: template.name,
      title: template.title,
      content: template.content,
      noteType: template.noteType,
      section: template.section,
      iconColor: template.iconColor ?? null,
    });
    setEditingTemplateId(template.id);
    setTemplateName(template.name.trim() || 'Untitled template');
    setDescription((template.description ?? '').trim());
    setIconColor(resolveNoteTemplateIconColor(template.id, template.iconColor));
    setAttachToSpace(Boolean(template.spaceId && listSpaceId && template.spaceId === listSpaceId));
    setAttachToChurch(Boolean(template.orgId));
    setSaveOpen(true);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  const handleSave = async () => {
    const name = templateName.trim();
    if (!name) {
      toast.error('Name this template first');
      return;
    }

    const canChooseSpace = Boolean(showSpaceAttachOption && canAttachToSpace && listSpaceId);
    // Church wins when both are somehow set: the server rejects org+space
    // together, and a starter is the more deliberate of the two choices.
    const toChurch = canChooseChurch && attachToChurch;
    const nextSpaceId = !toChurch && canChooseSpace && attachToSpace ? listSpaceId : null;
    const descriptionValue = description.trim() || null;

    try {
      if (editingTemplateId) {
        if (!liveContent.trim()) {
          toast.error('Template needs some content — edit it in the note');
          return;
        }
        await updateTemplate.mutateAsync({
          id: editingTemplateId,
          name,
          description: descriptionValue,
          iconColor,
          title: liveTitle,
          content: liveContent,
          noteType: noteType ?? 'default',
          // Never send spaceId for a church starter — the server rejects
          // re-scoping one into a space, and there is nothing to change here.
          ...(canChooseSpace && !toChurch ? { spaceId: nextSpaceId } : {}),
        });
        if (provenanceId === editingTemplateId) {
          onTemplateProvenanceChange?.({ id: editingTemplateId, name });
        }
        closeSavePanel();
        toast.success(
          toChurch
            ? 'Church template updated'
            : canChooseSpace && nextSpaceId
              ? 'Space template updated'
              : 'Template updated',
        );
        return;
      }

      if (!liveContent.trim()) {
        toast.error('Write something before saving a template');
        return;
      }
      await createTemplate.mutateAsync({
        name,
        description: descriptionValue,
        title: liveTitle,
        content: liveContent,
        noteType: noteType ?? 'default',
        iconColor,
        spaceId: nextSpaceId,
        orgId: toChurch ? listOrgId : null,
      });
      /* "Creating a template" has been done; the banner has nothing left to say. */
      clearComposePurpose();
      closeSavePanel();
      toast.success(
        toChurch
          ? 'Saved as a church template'
          : nextSpaceId
            ? 'Saved as a space template'
            : 'Saved as a template',
      );
    } catch (err) {
      const msg =
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : isEditing
              ? 'Could not update template'
              : 'Could not save template';
      toast.error(msg);
    }
  };

  return (
    <section className="proto-inspector-section">
      <PrototypeSectionHeader>Templates</PrototypeSectionHeader>

      {isGuest ? (
        /* Both actions here write to the server: saving one is a row, and the list is the
           account's. The offer is the honest version of a button that returned a 401. */
        <div className="proto-inspector-templates__actions">
          <button
            type="button"
            className="proto-inspector-templates__action-secondary"
            onClick={() => offerGuestAccount('Templates')}
          >
            Templates need a free account
          </button>
        </div>
      ) : !saveOpen ? (
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
              {isEditing ? 'Edit template' : 'Save as template'}
            </p>
            <button
              type="button"
              className="proto-inspector-templates__close"
              onClick={closeSavePanel}
              aria-label={isEditing ? 'Cancel edit template' : 'Cancel save template'}
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
          <label className="proto-inspector-templates__field">
            <span className="pds-caption">Description</span>
            <textarea
              className="proto-inspector-templates__description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH))}
              maxLength={NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH}
              rows={2}
              placeholder="Short blurb for the template list"
            />
            <span className="proto-inspector-templates__char-count" aria-live="polite">
              {description.length}/{NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH}
            </span>
          </label>
          <div className="proto-inspector-templates__field">
            <span className="pds-caption">Icon color</span>
            <div className="proto-inspector-templates__icon-row">
              <span className="proto-inspector-templates__icon-preview" aria-hidden>
                <ProtoSpaceMenuIcon
                  color={iconColor}
                  iconName={NOTE_TEMPLATE_ICON_NAME}
                  size={28}
                  radius={8}
                  glyphSize={13}
                />
              </span>
              <div
                className="proto-inspector-templates__swatches"
                role="radiogroup"
                aria-label="Template icon color"
              >
                {NOTE_TEMPLATE_ICON_COLORS.map((c) => {
                  const selected = iconColor === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`proto-inspector-templates__swatch${
                        selected ? ' proto-inspector-templates__swatch--selected' : ''
                      }`}
                      style={{ ['--swatch-accent' as string]: spacePickerSwatchColor(c) }}
                      title={c}
                      onClick={() => setIconColor(c)}
                    >
                      {selected ? <Icon name="check" size={10} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {showSpaceAttachOption && canAttachToSpace && listSpaceId ? (
            <label className="proto-inspector-templates__check">
              <input
                type="checkbox"
                checked={attachToSpace}
                disabled={attachToChurch}
                onChange={(e) => {
                  setAttachToSpace(e.target.checked);
                  if (e.target.checked) setAttachToChurch(false);
                }}
              />
              <span className="pds-caption">Make available in this space</span>
            </label>
          ) : null}
          {/* The one place a church starter gets created. Everyone connected to
              the church can then *use* it; only `manage_templates` holders see
              this control. */}
          {canChooseChurch ? (
            <label className="proto-inspector-templates__check">
              <input
                type="checkbox"
                checked={attachToChurch}
                onChange={(e) => {
                  setAttachToChurch(e.target.checked);
                  if (e.target.checked) setAttachToSpace(false);
                }}
              />
              <span className="pds-caption">Make available to my church</span>
            </label>
          ) : null}
          {isEditing ? (
            <p className="proto-inspector-muted" style={{ margin: 0 }}>
              Template loaded in the note — edit the body there, then save.
            </p>
          ) : null}
          <div className="proto-inspector-templates__save-actions">
            <button
              type="button"
              className="proto-inspector-templates__action-secondary"
              onClick={closeSavePanel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="proto-inspector-templates__action"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              <Icon name="list-check" size={12} aria-hidden />
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save template'}
            </button>
          </div>
        </div>
      )}

      <PrototypeBrowseTemplatesSheet
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        spaceId={spaceId}
        canManageChurchTemplates={canChooseChurch}
        spaceTitle={spaceTitle}
        showSpaceSection={showSpaceAttachOption}
        canManageSpaceTemplates={canAttachToSpace}
        onApply={onApply}
        onEdit={openEdit}
        placement="main-column-top-right"
      />
    </section>
  );
}
