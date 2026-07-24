/**
 * Dev-only design gallery for Shared Spaces UX touch points.
 * Open http://localhost:4322/__dev/shared-spaces-design while `npm run dev` runs.
 * Edit linked CSS/components — previews hot-reload.
 */
import { useNavigate, useSearch } from '@tanstack/react-router';
import '../../styles/prototype-shell.css';
import '../../styles/prototype-components.css';
import '../../styles/prototype-editor.css';
import '../../styles/prototype-design-gallery.css';
import {
  DEFAULT_DESIGN_SCENE_ID,
  sceneById,
  SHARED_SPACES_DESIGN_SCENES,
  type SharedSpacesDesignScene,
} from './shared-spaces-design/sceneRegistry';
import SharedSpacesDesignScenePreview from './shared-spaces-design/SharedSpacesDesignScenePreview';
import { HarvousLogoMark } from '../public/public-shared';

const PHASE_ORDER = ['Acquire', 'Shell', 'Collaboration', 'Confirms'] as const;

export default function SharedSpacesDesignGalleryPage() {
  const navigate = useNavigate();
  const { scene: sceneId } = useSearch({ strict: false }) as { scene?: string };
  const active = sceneById(sceneId) ?? sceneById(DEFAULT_DESIGN_SCENE_ID)!;

  function selectScene(next: SharedSpacesDesignScene) {
    void navigate({ to: '/__dev/shared-spaces-design', search: { scene: next.id }, replace: true });
  }

  const byPhase = PHASE_ORDER.map((phase) => ({
    phase,
    scenes: SHARED_SPACES_DESIGN_SCENES.filter((s) => s.phase === phase),
  }));

  return (
    <div className="proto-theme pds-gallery">
      <aside className="pds-gallery__nav">
        <div className="pds-gallery__brand">
          <div className="pds-gallery__brand-pill" aria-label="Shared Spaces design">
            <span className="pds-gallery__brand-mark">
              <HarvousLogoMark size={28} />
            </span>
            <div className="pds-gallery__brand-copy">
              <p className="pds-gallery__brand-title">Shared Spaces</p>
              <p className="pds-gallery__brand-subtitle">Live previews · dev only</p>
            </div>
          </div>
          <h1 className="pds-gallery__sr-only">Shared Spaces design</h1>
        </div>
        {byPhase.map(({ phase, scenes }) => (
          <div key={phase} className="pds-gallery__phase">
            <p className="pds-footnote pds-gallery__phase-label">{phase}</p>
            <ul className="pds-gallery__scene-list">
              {scenes.map((scene) => (
                <li key={scene.id}>
                  <button
                    type="button"
                    className="pds-gallery__scene-btn"
                    data-active={scene.id === active.id ? 'true' : undefined}
                    onClick={() => selectScene(scene)}
                  >
                    {scene.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <main className="pds-gallery__main">
        <header className="pds-gallery__header">
          <p className="pds-caption pds-gallery__meta">
            {active.phase} · {active.id}
          </p>
          <h2 className="pds-list-title pds-gallery__heading">{active.title}</h2>
          <p className="pds-caption pds-gallery__edit">
            Edit:{' '}
            {active.editFiles.map((file, i) => (
              <span key={file}>
                {i > 0 ? ', ' : null}
                <code>{file}</code>
              </span>
            ))}
          </p>
        </header>

        <div className="pds-gallery__canvas" data-testid="shared-spaces-scene-preview">
          <SharedSpacesDesignScenePreview scene={active} />
        </div>

        <p className="pds-caption pds-gallery__tip">
          Tip: split this URL in Cursor&apos;s browser panel beside your CSS. Changes hot-reload. Full design system
          (tokens + primitives): <code>/__dev/design-system</code>
          {' · '}
          For the full dashboard inside the live shell, open <code>?sharedSpaceFixture=full</code> on localhost and tap
          the space orb (H).
        </p>
      </main>
    </div>
  );
}

/** Route search typing helper */
export type SharedSpacesDesignSearch = { scene?: string };
