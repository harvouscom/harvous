/**
 * How to put Harvous on a phone's home screen.
 *
 * Two things a reader needs that plain prose was not giving them: which
 * platform these steps are for, and what the thing they are meant to tap looks
 * like. So the platform is a segmented control rather than two stacked
 * headings, and every step carries the glyph of the control it names — the
 * share square, the three-dot menu — beside a numbered marker.
 *
 * **The browser line is the one that saves people.** On iOS only Safari can add
 * to the home screen; a reader following these steps in Chrome finds no such
 * menu item and concludes the app is broken. That is said under the toggle,
 * before the steps, rather than left to be discovered at step two.
 *
 * The detected platform preselects the toggle, and both halves are always
 * offered: detection is a guess (a desktop preview, an iPad reporting as a Mac,
 * someone reading their partner's phone), and being wrong should cost a tap
 * rather than hiding the steps that apply.
 */
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { safeRenderHtml } from '@/utils/content-renderer';
import { useInstallPrompt } from '../../lib/install-prompt';
import { appearanceCompanionImage } from '../../lib/appearance-companion-image';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import type { InstallPlatform } from '@/utils/platform-detect';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
/*
  Five marks that live here rather than in the shared `Icon` registry.
  That registry inlines every SVG it knows into the initial bundle, and these
  are used on exactly one surface — a sheet most sessions never open. Held
  locally, they ride this file's chunk instead of charging sign-in for the
  Safari logo. Font Awesome Free ships the brand marks under CC BY 4.0.
*/
import appleSvg from '@fortawesome/fontawesome-free/svgs/brands/apple.svg?raw';
import androidSvg from '@fortawesome/fontawesome-free/svgs/brands/android.svg?raw';
/* iOS's Share control: a box with an arrow leaving it, which is the shape a
   reader is hunting for in Safari's bottom bar — not FA's `share` swoosh. */
import shareIosSvg from '@fortawesome/fontawesome-free/svgs/solid/arrow-up-from-bracket.svg?raw';

const LOCAL_GLYPHS = {
  apple: appleSvg,
  android: androidSvg,
  'share-ios': shareIosSvg,
} as const;

type LocalGlyphName = keyof typeof LOCAL_GLYPHS;

/* One stable `{ __html }` per name+size, for the reason the shared Icon keeps
   one: React re-applies innerHTML whenever the object identity changes. */
const glyphMarkup = new Map<string, { __html: string }>();

function glyphHtml(name: LocalGlyphName, size: number): { __html: string } {
  const key = `${name}|${size}`;
  let markup = glyphMarkup.get(key);
  if (!markup) {
    const sized = LOCAL_GLYPHS[name]
      .replace(/<svg\s+/, `<svg fill="currentColor" width="${size}" height="${size}" style="display:block" `);
    markup = { __html: safeRenderHtml(sized) };
    glyphMarkup.set(key, markup);
  }
  return markup;
}

function BrandGlyph({ name, size = 16 }: { name: LocalGlyphName; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ display: 'inline-flex', width: size, height: size, color: 'inherit' }}
      dangerouslySetInnerHTML={glyphHtml(name, size)}
    />
  );
}

/**
 * The browser, as its icon appears on the reader's own device.
 *
 * Drawn here rather than taken from the icon set, because the set's brand marks
 * are single-colour silhouettes: a flat grey disc says "a browser" where the
 * reader is looking for the *thing on their home screen*. Both are the marks
 * they are about to tap — Safari's blue compass, Chrome's four-colour wheel —
 * sitting on the rounded white tile the platform draws under them.
 *
 * Small enough to be a label, not an advertisement: this appears once, at 24px,
 * beside the sentence naming which browser the steps below belong to.
 */
function BrowserAppIcon({ browser }: { browser: 'safari' | 'chrome' }) {
  if (browser === 'safari') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" role="img" aria-hidden focusable="false">
        <defs>
          {/* Lighter at the top, as the icon is on the device. */}
          <linearGradient id="harvous-safari-face" x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#19B9FF" />
            <stop offset="1" stopColor="#0A6FE0" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="11" fill="url(#harvous-safari-face)" />
        <circle cx="12" cy="12" r="9.1" fill="none" stroke="#ffffff" strokeWidth="0.9" opacity="0.85" />
        {/* The needle: red to the north-east, white to the south-west, widest
            where the two halves meet. */}
        <path d="M17.7 6.3 13.7 13.7 10.3 10.3Z" fill="#FF4133" />
        <path d="M6.3 17.7 10.3 10.3 13.7 13.7Z" fill="#ffffff" />
      </svg>
    );
  }

  /* Three 120° sectors around the centre, then the white ring and the blue
     hub — the wheel's actual construction, so it reads correctly at 20px. */
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" role="img" aria-hidden focusable="false">
      <path d="M1.61 6A12 12 0 0 1 22.39 6L12 12Z" fill="#EA4335" />
      <path d="M22.39 6A12 12 0 0 1 12 24L12 12Z" fill="#FBBC05" />
      <path d="M12 24A12 12 0 0 1 1.61 6L12 12Z" fill="#34A853" />
      <circle cx="12" cy="12" r="6.4" fill="#ffffff" />
      <circle cx="12" cy="12" r="5.1" fill="#4285F4" />
    </svg>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  platform: InstallPlatform;
  /** Called when Chrome reports the install was accepted, so the card can go. */
  onInstalled?: () => void;
};

/** The two platforms with steps. `other` picks a side rather than showing none. */
type StepPlatform = 'ios' | 'android';

type StepGlyph =
  | { kind: 'icon'; name: 'plus' | 'check' | 'ellipsis-vertical' }
  | { kind: 'local'; name: LocalGlyphName };

type InstallStep = {
  /** What to do, with the control's own name in bold where there is one. */
  text: React.ReactNode;
  /** The glyph of the thing being tapped; omitted when a step names no control. */
  glyph?: StepGlyph;
};

const PLATFORMS: Array<{
  value: StepPlatform;
  label: string;
  icon: LocalGlyphName;
  browser: { name: string; icon: 'safari' | 'chrome'; note: string };
  steps: InstallStep[];
}> = [
  {
    value: 'ios',
    label: 'iPhone',
    icon: 'apple',
    browser: {
      name: 'Safari',
      icon: 'safari',
      /* Said because the steps below are Safari's. Chrome, Firefox and Edge
         on iOS can install too — that has been true since iOS 16.4 — but each
         puts the item somewhere else, so naming the browser the steps describe
         is the honest version of this warning. Claiming they cannot would be
         wrong, and wrong in a way a reader can catch. */
      note: 'Other browsers can do this too, but the menu sits somewhere else.',
    },
    steps: [
      { text: <>Tap <strong>Share</strong> in the bottom bar</>, glyph: { kind: 'local', name: 'share-ios' } },
      { text: <>Scroll down and tap <strong>Add to Home Screen</strong></>, glyph: { kind: 'icon', name: 'plus' } },
      { text: <>Tap <strong>Add</strong></>, glyph: { kind: 'icon', name: 'check' } },
    ],
  },
  {
    value: 'android',
    label: 'Android',
    icon: 'android',
    browser: {
      name: 'Chrome',
      icon: 'chrome',
      note: 'Other browsers may word this differently.',
    },
    steps: [
      { text: <>Tap the menu in the top corner</>, glyph: { kind: 'icon', name: 'ellipsis-vertical' } },
      { text: <>Tap <strong>Install app</strong> or <strong>Add to Home Screen</strong></>, glyph: { kind: 'icon', name: 'plus' } },
      /* Which label the confirm carries depends on the Chrome version and
         which of the two menu items was tapped, so the step names both rather
         than betting on one. */
      { text: <>Confirm with <strong>Install</strong> or <strong>Add</strong></>, glyph: { kind: 'icon', name: 'check' } },
    ],
  },
];

/**
 * A sliver of the reader's own appearance above the title.
 *
 * The same picture their canvas is wearing, or the one the catalogue pairs with
 * the colour they chose — see `appearance-companion-image`. A band above the
 * header rather than a wash behind it, which is how a room wears its cover, and
 * the reason is contrast: over the title the picture would have to be faded to
 * about a third before `--pds-text-primary` was safe on the busiest frame in
 * the catalogue, and a third of a photograph is a smudge. Given its own strip
 * it can be itself, and the title keeps the contrast it always had.
 *
 * Held back until the file has decoded, the way the space hero is: the paired
 * image is already cached when it is their wallpaper, and worth one frame of
 * patience when it is not.
 */
function HeaderSliver() {
  const mode = useSyncExternalStore(
    subscribeColorScheme,
    getColorSchemeSnapshot,
    () => 'light' as const,
  );
  const companion = appearanceCompanionImage(mode);
  const url = companion?.url ?? null;
  const [readyUrl, setReadyUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setReadyUrl(null);
      return undefined;
    }
    let cancelled = false;
    setReadyUrl(null);
    /* A plain decode rather than the auth-hero preloader: that module downloads
       its own nine wallpapers the moment it is imported, which is a fair price
       on the sign-in screen and an absurd one for a 62px strip. A failed load
       still reveals it — the browser paints what it can, and a blank strip is
       the worse of the two outcomes. */
    const img = new Image();
    const reveal = () => {
      if (!cancelled) setReadyUrl(url);
    };
    img.onload = reveal;
    img.onerror = reveal;
    img.src = url;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  if (!url) return null;

  /* The colour lands immediately and the picture crossfades over it, so the
     strip is never an empty gap above the title. */
  return (
    <span
      aria-hidden
      className="proto-install-web-app-sheet__sliver"
      style={companion?.tint ? { backgroundColor: companion.tint } : undefined}
    >
      <span
        className={`proto-install-web-app-sheet__sliver-image${
          readyUrl === url ? ' proto-install-web-app-sheet__sliver-image--ready' : ''
        }`}
        style={{ backgroundImage: `url("${url}")` }}
      />
    </span>
  );
}

/** iOS when nothing was detected — the larger half of the audience this card is shown to. */
function initialPlatform(platform: InstallPlatform): StepPlatform {
  return platform === 'android' ? 'android' : 'ios';
}

export default function PrototypeInstallWebAppSheet({ open, onClose, platform, onInstalled }: Props) {
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const { canInstall, install } = useInstallPrompt();
  const [selected, setSelected] = useState<StepPlatform>(() => initialPlatform(platform));

  /* Re-armed on each opening rather than only on mount: the sheet stays mounted
     between visits, so without this a reader who looked at the other platform
     once would keep landing there. */
  useEffect(() => {
    if (open) setSelected(initialPlatform(platform));
  }, [open, platform]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  const activeIndex = PLATFORMS.findIndex((p) => p.value === selected);
  const active = PLATFORMS[activeIndex] ?? PLATFORMS[0];

  return createPortal(
    <div
      className={[
        'proto-votd-sheet-overlay',
        'proto-votd-sheet-overlay--motion',
        exiting ? 'proto-votd-sheet-overlay--exiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={[
          'proto-votd-sheet',
          'proto-install-web-app-sheet',
          'proto-votd-sheet--motion',
          exiting ? 'proto-votd-sheet--exiting' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-label="Add Harvous to your home screen"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Over the picture in the corner, the way a room's cover carries its
            own controls — and first in the DOM, so the way out is the first
            thing a screen reader reaches. Out of the header's flex row, which
            gives the title back the width the button was holding. */}
        <button
          type="button"
          className="proto-toolbar-icon-btn proto-install-web-app-sheet__close"
          aria-label="Close"
          onClick={onClose}
        >
          <Icon name="xmark" size={18} />
        </button>

        <HeaderSliver />

        <header className="proto-votd-sheet__header proto-install-web-app-sheet__header">
          <div className="proto-votd-sheet__header-text">
            {/* What this costs, not what device you are holding — the toggle
                below already says that, and the old eyebrow said it twice. */}
            <p className="proto-caption proto-votd-sheet__eyebrow">One-time setup</p>
            <h2 className="proto-votd-sheet__reference">Add Harvous to your home screen</h2>
          </div>
        </header>

        <div className="proto-votd-sheet__divider" aria-hidden />

        <div className="proto-votd-sheet__body proto-install-web-app-sheet__body">
          {/*
            Where Chrome has handed us a prompt, the button is the answer and
            the steps below it are the fallback — so it goes first, and the
            steps get a heading that says what they are for. On iOS there is no
            prompt to hold, and this whole block is absent.
          */}
          {canInstall ? (
            <div className="proto-install-web-app-sheet__oneTap">
              <button
                type="button"
                className="proto-share-popover__primary"
                onClick={() => {
                  void install().then((outcome) => {
                    if (outcome === 'accepted') {
                      onInstalled?.();
                      onClose();
                    }
                  });
                }}
              >
                Install Harvous
              </button>
              <p className="proto-install-web-app-sheet__outcome">
                Your browser can add it for you. The steps below are the same
                thing by hand.
              </p>
            </div>
          ) : null}

          <div
            className="proto-install-seg proto-seg-track"
            role="radiogroup"
            aria-label="Which phone"
            style={
              {
                '--proto-seg-count': PLATFORMS.length,
                '--proto-seg-index': Math.max(activeIndex, 0),
              } as CSSProperties
            }
          >
            {PLATFORMS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={option.value === selected}
                data-active={option.value === selected}
                className="proto-install-seg__btn"
                onClick={() => setSelected(option.value)}
              >
                <BrandGlyph name={option.icon} size={14} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          <p className="proto-install-web-app-sheet__browser">
            <span className="proto-install-web-app-sheet__browser-icon" aria-hidden>
              <BrowserAppIcon browser={active.browser.icon} />
            </span>
            <span className="proto-install-web-app-sheet__browser-text">
              <strong>In {active.browser.name}.</strong> {active.browser.note}
            </span>
          </p>

          <ol className="proto-install-web-app-sheet__steps">
            {active.steps.map((step, i) => (
              /* Keyed by platform and position: the two lists are different
                 content in the same slots, and a shared key would let one
                 platform's row animate into the other's. */
              <li key={`${active.value}-${i}`} className="proto-install-step">
                <span className="proto-install-step__marker" aria-hidden>
                  {i + 1}
                </span>
                <span className="proto-install-step__text">{step.text}</span>
                {step.glyph ? (
                  <span className="proto-install-step__glyph" aria-hidden>
                    {step.glyph.kind === 'icon' ? (
                      <Icon name={step.glyph.name} size={14} />
                    ) : (
                      <BrandGlyph name={step.glyph.name} size={14} />
                    )}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>

          {/* What installing actually changes, and only that. Offline used to be
              claimed here, which reads as something you get by installing —
              the service worker gives it either way, so the sentence was
              selling a benefit the reader already had. `standalone` in the
              manifest is what makes the window promise true. */}
          <p className="proto-install-web-app-sheet__outcome">
            Harvous then opens from your home screen in its own window, with no
            browser bar around it.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
