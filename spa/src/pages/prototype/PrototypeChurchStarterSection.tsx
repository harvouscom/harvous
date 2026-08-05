/**
 * Note templates a church provisions for its people ("church templates").
 *
 * Deliberately not a template *editor*. Content is authored the way every other
 * template in Harvous is: write a real note, then "Make available to my church"
 * from the note's Templates panel. That keeps one authoring path instead of a
 * second editor that would drift from the first, and it means a starter is
 * always something a pastor has actually written and read back.
 *
 * What lives here is the part the note can't do: seeing every starter the
 * church has, renaming one, describing it, and removing it.
 */
import { useState } from 'react';
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
import { useNoteTemplates, type StoredNoteTemplate } from '../../hooks/queries/useNoteTemplates';
import { useUpdateNoteTemplate } from '../../hooks/mutations/useUpdateNoteTemplate';
import { useDeleteNoteTemplate } from '../../hooks/mutations/useDeleteNoteTemplate';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import PrototypeListEmptyState from './PrototypeListEmptyState';

export interface PrototypeChurchStarterSectionProps {
  /** Server's `manage_templates` verdict — never re-derived from a role string. */
  canManage: boolean;
  /** False when the church's plan has lapsed: writes stop, reading never does. */
  canWrite: boolean;
}

export default function PrototypeChurchStarterSection({
  canManage,
  canWrite,
}: PrototypeChurchStarterSectionProps) {
  const { data, isPending } = useNoteTemplates();
  const updateTemplate = useUpdateNoteTemplate();
  const deleteTemplate = useDeleteNoteTemplate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconColor, setIconColor] = useState<string>(NOTE_TEMPLATE_ICON_COLORS[0]!);
  const [error, setError] = useState<string | null>(null);

  const starters = data?.org ?? [];
  const saving = updateTemplate.isPending || deleteTemplate.isPending;

  const openEdit = (template: StoredNoteTemplate) => {
    setError(null);
    setEditingId(template.id);
    setName(template.name);
    setDescription((template.description ?? '').trim());
    setIconColor(resolveNoteTemplateIconColor(template.id, template.iconColor));
  };

  const save = async (template: StoredNoteTemplate) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name this template first');
      return;
    }
    setError(null);
    try {
      /*
        Metadata only — no `content`, which the server reads as "keep the stored
        body". Editing the body happens in a note, so sending the live editor's
        content from here would overwrite a starter with whatever note the
        pastor happened to have open.
      */
      await updateTemplate.mutateAsync({
        id: template.id,
        name: trimmed,
        description: description.trim() || null,
        iconColor,
      });
      setEditingId(null);
      toast.success('Church template updated');
    } catch (err) {
      setError(
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not update this template.',
      );
    }
  };

  const remove = async (template: StoredNoteTemplate) => {
    if (
      !window.confirm(
        `Remove ${template.name} from your church's templates? Notes already written from it are untouched.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteTemplate.mutateAsync(template.id);
      setEditingId(null);
      toast.success('Church template removed');
    } catch (err) {
      setError(
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not remove this template.',
      );
    }
  };

  if (!canManage) return null;
  if (isPending && starters.length === 0) return null;

  return (
    <div className="proto-home-section">
      {/* The count lane only earns its place once there is something to count;
          empty, the designed empty state carries the heading itself. */}
      {starters.length > 0 ? (
        <div className="proto-church-tools__lane-head">
          <p className="proto-caption proto-home-section__eyebrow">
            {`${starters.length} template${starters.length === 1 ? '' : 's'}`}
          </p>
        </div>
      ) : null}

      {starters.length === 0 ? (
        /* Same anatomy as the Threads empty state — icon, title, description —
           rather than a bare caption. */
        <div className="proto-list-create-empty">
          <PrototypeListEmptyState
            iconName={NOTE_TEMPLATE_ICON_NAME}
            title="No templates yet"
            description="Write a note the way you want your church to start theirs, then save it from the note's Templates panel."
          />
        </div>
      ) : (
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {starters.map((template) =>
            editingId === template.id ? (
              <div key={template.id} className="proto-church-starter__edit">
                <label
                  className="proto-inspector-section-title proto-create-folder-sheet__field-label"
                  htmlFor={`starter-name-${template.id}`}
                >
                  Name
                </label>
                <input
                  id={`starter-name-${template.id}`}
                  type="text"
                  className="proto-create-folder-sheet__name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <label
                  className="proto-inspector-section-title proto-create-folder-sheet__field-label"
                  htmlFor={`starter-desc-${template.id}`}
                >
                  <span>Description</span>
                  <span className="proto-service-editor__optional">optional</span>
                </label>
                <input
                  id={`starter-desc-${template.id}`}
                  type="text"
                  className="proto-create-folder-sheet__name-input"
                  value={description}
                  maxLength={NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH}
                  placeholder="What this template is for"
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="proto-inspector-templates__swatches">
                  {NOTE_TEMPLATE_ICON_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`proto-inspector-templates__swatch${
                        iconColor === c ? ' proto-inspector-templates__swatch--selected' : ''
                      }`}
                      style={{ ['--swatch-accent' as string]: spacePickerSwatchColor(c) }}
                      title={c}
                      onClick={() => setIconColor(c)}
                    >
                      {iconColor === c ? <Icon name="check" size={10} /> : null}
                    </button>
                  ))}
                </div>
                {error ? (
                  <p className="proto-connect-note-sheet__error" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="proto-church-starter__edit-actions">
                  <button
                    type="button"
                    className="proto-share-popover__primary"
                    disabled={saving}
                    onClick={() => void save(template)}
                  >
                    {updateTemplate.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="proto-sheet-quiet-action"
                    disabled={saving}
                    onClick={() => {
                      setEditingId(null);
                      setError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="proto-sheet-quiet-action proto-sheet-quiet-action--danger"
                    disabled={saving}
                    onClick={() => void remove(template)}
                  >
                    Remove from church
                  </button>
                </div>
              </div>
            ) : (
              /* A div, not a button: the row is inert for a lapsed church, and
                 the edit affordance is the whole row when it isn't. */
              <button
                key={template.id}
                type="button"
                className="proto-church-tools__row"
                disabled={!canWrite}
                onClick={() => openEdit(template)}
              >
                <span className="proto-church-tools__row-icon" aria-hidden>
                  <ProtoSpaceMenuIcon
                    color={resolveNoteTemplateIconColor(template.id, template.iconColor)}
                    size={24}
                    radius={7}
                    iconName={NOTE_TEMPLATE_ICON_NAME}
                  />
                </span>
                <span className="proto-church-tools__row-text">
                  <span className="pds-list-title proto-church-tools__row-title">
                    {template.name}
                  </span>
                  {template.description ? (
                    <span className="proto-caption proto-church-tools__row-meta">
                      {template.description}
                    </span>
                  ) : null}
                </span>
                {canWrite ? (
                  <span className="proto-home-card__chevron" aria-hidden>
                    <Icon name="caret-right" size={11} />
                  </span>
                ) : null}
              </button>
            ),
          )}
        </div>
      )}

      {error && !editingId ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
