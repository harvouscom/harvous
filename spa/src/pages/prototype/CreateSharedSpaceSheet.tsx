/**
 * Create Shared Space — same chrome as the space About dialog (hero + letter),
 * with editable name/description and color/cover pickers on the live preview.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { type ThreadColor } from '@/utils/colors';
import {
  SPACE_COVER_PICKER_COLORS,
  appearanceIconGlyphColor,
  spaceCoverFromThreadColor,
  spaceIconAccentHex,
  spacePickerSwatchColor,
} from '@/utils/space-cover';
import {
  clampSpaceCoverVariant,
  listSpaceCoverVariantsForFamily,
  spaceCoverPresetUrl,
} from '@/utils/space-cover-presets';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { useCreateSharedSpace } from '../../hooks/mutations/useCreateSharedSpace';
import { useCreateChurchSharedSpace } from '../../hooks/mutations/useCreateChurchSharedSpace';
import { useCreateMinistryChannel } from '../../hooks/mutations/useCreateMinistryChannel';
import { getNavigationQueryKey } from '../../hooks/queries/useNavigation';
import { APIError } from '../../lib/api';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoDialogFocus } from '../../hooks/useProtoDialogFocus';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoShell } from '../../layouts/proto-shell-context';
import PublicJoinSpaceHero from '../public/PublicJoinSpaceHero';

type CoverPickerMode = 'none' | 'color' | 'image';

export type CreateSpaceSheetKind = 'shared' | 'ministry';

export interface CreateSharedSpaceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, creates under this church org (shared or ministry). */
  orgId?: string | null;
  /** Church org create mode — ignored without orgId. Default church Shared Space. */
  kind?: CreateSpaceSheetKind;
  /** After create — typically select the new space in the shell. */
  onCreated?: (spaceId: string) => void;
}

export default function CreateSharedSpaceSheet({
  open,
  onOpenChange,
  orgId = null,
  kind = 'shared',
  onCreated,
}: CreateSharedSpaceSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const { isMobileSidebar, ensureSidebarExpanded } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<ThreadColor>('blue');
  const [coverVariant, setCoverVariant] = useState(1);
  const [pickerMode, setPickerMode] = useState<CoverPickerMode>('none');
  const [error, setError] = useState<string | null>(null);
  const [showAddonLink, setShowAddonLink] = useState(false);

  const createSharedSpace = useCreateSharedSpace();
  const createChurchSharedSpace = useCreateChurchSharedSpace();
  const createMinistryChannel = useCreateMinistryChannel();
  const pending =
    createSharedSpace.isPending ||
    createChurchSharedSpace.isPending ||
    createMinistryChannel.isPending;
  const churchScoped = Boolean(orgId?.trim());
  const ministryChannel = churchScoped && kind === 'ministry';
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setColor('blue');
    setCoverVariant(1);
    setPickerMode('none');
    setError(null);
    setShowAddonLink(false);
  }, [open, orgId, kind]);

  const cover = spaceCoverFromThreadColor(color, coverVariant);
  const heroSpace = {
    color,
    cover: { light: cover.light, dark: cover.dark },
  };
  const variantThumbs = listSpaceCoverVariantsForFamily(color, colorScheme);
  const iconAccent = spaceIconAccentHex(color, colorScheme);
  const iconGlyphColor = appearanceIconGlyphColor(color, colorScheme);

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.08,
      fallbackWidth: 360,
      fallbackHeight: 560,
      // Picker trays / typing change height — don't re-center and jump.
      stablePosition: true,
    },
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation, {
    dismissOnEscape: false,
  });
  useProtoDialogFocus({
    open: open && showPopoverPortal,
    dialogRef: cardRef,
    onDismiss: () => onOpenChange(false),
  });

  function toggleMode(mode: Exclude<CoverPickerMode, 'none'>) {
    setPickerMode((prev) => (prev === mode ? 'none' : mode));
  }

  function selectColor(next: ThreadColor) {
    if (next !== color) {
      setColor(next);
      setCoverVariant(1);
    }
  }

  async function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    setError(null);
    setShowAddonLink(false);
    try {
      const payload = {
        title: trimmed,
        color,
        coverVariant: clampSpaceCoverVariant(coverVariant),
        description: description.trim() || null,
      };

      const result = ministryChannel
        ? await createMinistryChannel.mutateAsync({ ...payload, orgId: orgId!.trim() })
        : churchScoped
          ? await createChurchSharedSpace.mutateAsync({ ...payload, orgId: orgId!.trim() })
          : await createSharedSpace.mutateAsync(payload);

      if (!result.space?.id) {
        setError(
          ministryChannel
            ? 'Channel was created but the response was incomplete. Try refreshing.'
            : 'Shared space was created but the response was incomplete. Try refreshing.',
        );
        return;
      }

      if (userId) {
        await queryClient.refetchQueries({ queryKey: getNavigationQueryKey(userId) });
      }

      onOpenChange(false);
      ensureSidebarExpanded();
      onCreated?.(result.space.id);
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.message || `Request failed (${err.status})`);
        setShowAddonLink(!churchScoped && err.status === 403 && err.code === 'SHARED_SPACE_LIMIT_EXCEEDED');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(ministryChannel ? 'Could not create channel. Try again.' : 'Could not create shared space. Try again.');
      }
    }
  }

  /*
    No church qualifier in either string. The sheet only opens from My Church
    when `churchScoped`, so the header above it already names the church —
    "New church shared space" was repeating context the user could see.
  */
  const headerTitle = ministryChannel ? 'New channel' : 'New shared space';
  const titlePlaceholder = ministryChannel ? 'Channel name' : 'Space name';
  const tileIconName = ministryChannel ? 'rss' : 'user-group';

  const content = (
    <>
      <h2 id={headingId} className="sr-only">
        {headerTitle}
      </h2>
      <div className="proto-shared-space-about__scroll">
        <div className="proto-shared-space-about__hero">
          <button
            type="button"
            className={`proto-create-shared-space__hero-hit${pickerMode === 'image' ? ' proto-create-shared-space__hero-hit--active' : ''}`}
            aria-pressed={pickerMode === 'image'}
            aria-label="Choose cover image"
            title="Choose cover image"
            onClick={() => toggleMode('image')}
          >
            <PublicJoinSpaceHero space={heroSpace} />
          </button>
          <button
            type="button"
            className="proto-side-panel__action-btn proto-shared-space-about__close"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            title="Close"
          >
            <Icon name="xmark" size={12} />
          </button>
        </div>

        <div className="proto-shared-space-about__letter">
          <div className="public-join-letter-about proto-create-shared-space__letter">
            <div className="public-join-letter-about__header">
              <button
                type="button"
                className={`public-join-letter-about__icon space-icon-tile proto-create-shared-space__icon-hit${
                  colorScheme === 'dark' ? ' space-icon-tile--on-dark' : ''
                }${pickerMode === 'color' ? ' proto-create-shared-space__icon-hit--active' : ''}`}
                style={
                  {
                    ['--space-icon-accent' as string]: iconAccent,
                    color: iconGlyphColor ?? undefined,
                  } as CSSProperties
                }
                aria-pressed={pickerMode === 'color'}
                aria-label="Choose color"
                title="Choose color"
                onClick={() => toggleMode('color')}
              >
                <Icon name={tileIconName} size={22} />
              </button>
              <input
                type="text"
                className="public-addon-letter__title proto-create-shared-space__title-input"
                value={title}
                maxLength={80}
                autoFocus
                data-proto-dialog-initial-focus
                placeholder={titlePlaceholder}
                aria-label={ministryChannel ? 'Channel name' : 'Space name'}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) {
                    setError(null);
                    setShowAddonLink(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                }}
              />
            </div>
            <textarea
              className="public-join-letter-about__description proto-create-shared-space__description-input"
              value={description}
              maxLength={500}
              rows={2}
              placeholder="Optional description"
              aria-label="Description"
              onChange={(e) => setDescription(e.target.value)}
            />

            {pickerMode === 'color' ? (
              <div
                className="proto-space-cover-picker__tray proto-create-shared-space__tray"
                role="radiogroup"
                aria-label="Color"
              >
                {SPACE_COVER_PICKER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    className={`proto-shared-space-settings__color proto-space-cover-picker__tray-swatch${
                      color === c ? ' proto-shared-space-settings__color--selected' : ''
                    }`}
                    style={{ ['--swatch-accent' as string]: spacePickerSwatchColor(c) }}
                    title={c}
                    onClick={() => selectColor(c)}
                  >
                    {color === c ? <Icon name="check" size={12} /> : null}
                  </button>
                ))}
              </div>
            ) : null}

            {pickerMode === 'image' && variantThumbs.length > 0 ? (
              <div
                className="proto-space-cover-picker__tray proto-create-shared-space__tray"
                role="radiogroup"
                aria-label="Cover image"
              >
                {variantThumbs.map((preset) => {
                  const selected = coverVariant === preset.variant;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={preset.label}
                      title={preset.label}
                      className={`proto-space-cover-picker__thumb${selected ? ' proto-space-cover-picker__thumb--selected' : ''}`}
                      style={{ backgroundImage: `url(${spaceCoverPresetUrl(preset)})` }}
                      onClick={() => setCoverVariant(preset.variant)}
                    >
                      {selected ? (
                        <span className="proto-space-cover-picker__thumb-check" aria-hidden>
                          <Icon name="check" size={12} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {pickerMode === 'none' ? (
              <p className="proto-caption proto-create-shared-space__hint">
                Tap the color block or image to customize
              </p>
            ) : null}

            {error ? (
              <div className="proto-space-switcher__create-error" role="alert">
                <span className="proto-space-switcher__create-error-text">{error}</span>
                {showAddonLink ? (
                  <button
                    type="button"
                    className="proto-space-switcher__create-error-link"
                    onClick={() => {
                      onOpenChange(false);
                      void navigate({ to: '/upgrade' as any });
                    }}
                  >
                    Get Shared Spaces
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="proto-create-shared-space__actions">
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="proto-settings-btn"
                disabled={!title.trim() || pending}
                onClick={() => void handleCreate()}
              >
                {pending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (!open && !mounted) return null;

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label="Close create shared space dialog"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className={portaledDialogShellClassName('proto-shared-space-about proto-create-shared-space', exiting)}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          {content}
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open) return null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-shared-space-about proto-shared-space-about--sheet proto-create-shared-space"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
