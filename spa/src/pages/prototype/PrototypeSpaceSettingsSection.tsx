import { useEffect, useState } from 'react';
import Icon from '@/components/react/Icon';
import { type ThreadColor } from '@/utils/colors';
import { SPACE_COVER_PICKER_COLORS, spacePickerSwatchColor } from '@/utils/space-cover';
import { useUpdateSharedSpace } from '../../hooks/mutations/useUpdateSharedSpace';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';

export default function PrototypeSpaceSettingsSection({
  spaceId,
  initialTitle,
  initialColor,
  initialDescription,
  onSaved,
}: {
  spaceId: string;
  initialTitle: string;
  initialColor?: string | null;
  initialDescription?: string | null;
  onSaved?: (title: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [color, setColor] = useState<ThreadColor>((initialColor as ThreadColor) || 'purple');
  const [description, setDescription] = useState(initialDescription ?? '');
  const updateSpace = useUpdateSharedSpace();

  useEffect(() => {
    setTitle(initialTitle);
    setColor(((initialColor as ThreadColor) || 'purple') as ThreadColor);
    setDescription(initialDescription ?? '');
  }, [initialTitle, initialColor, initialDescription, spaceId]);

  const normalizedDescription = description.trim();
  const initialDescriptionNorm = (initialDescription ?? '').trim();
  const dirty =
    title.trim() !== initialTitle.trim() ||
    color !== (initialColor || 'purple') ||
    normalizedDescription !== initialDescriptionNorm;

  function save() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('Space name is required');
      return;
    }
    updateSpace.mutate(
      {
        spaceId,
        title: trimmed,
        color,
        description: normalizedDescription || null,
      },
      {
        onSuccess: () => {
          toast.success('Space updated');
          onSaved?.(trimmed);
        },
        onError: (err) => {
          const msg =
            err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not update space';
          toast.error(msg);
        },
      },
    );
  }

  return (
    <div className="proto-shared-space-settings">
      <div className="proto-shared-space-settings__field">
        <label htmlFor="proto-space-settings-title">Name</label>
        <input
          id="proto-space-settings-title"
          type="text"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="proto-shared-space-settings__field">
        <label htmlFor="proto-space-settings-description">Description</label>
        <textarea
          id="proto-space-settings-description"
          value={description}
          maxLength={500}
          rows={2}
          placeholder="Optional — shown on the join page"
          onChange={(e) => setDescription(e.target.value)}
          style={{ resize: 'vertical', minHeight: 52 }}
        />
      </div>
      <div className="proto-shared-space-settings__field">
        <span className="proto-inspector-section-title" style={{ marginBottom: 6, display: 'block' }}>
          Color
        </span>
        <div className="proto-shared-space-settings__colors" role="radiogroup" aria-label="Space color">
          {SPACE_COVER_PICKER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              className={`proto-shared-space-settings__color${color === c ? ' proto-shared-space-settings__color--selected' : ''}`}
              style={{ ['--swatch-accent' as string]: spacePickerSwatchColor(c) }}
              title={c}
              onClick={() => setColor(c)}
            >
              {color === c ? <Icon name="check" size={12} /> : null}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="proto-settings-btn"
        disabled={!dirty || updateSpace.isPending}
        onClick={save}
        style={{ marginTop: 12 }}
      >
        {updateSpace.isPending ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
