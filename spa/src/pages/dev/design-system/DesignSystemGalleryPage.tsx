/**
 * Dev-only Harvous design-system gallery.
 * Open http://localhost:4322/__dev/design-system while `npm run dev` runs.
 * Shared Spaces scenes remain available at /__dev/shared-spaces-design.
 */
import { useNavigate, useSearch } from '@tanstack/react-router';
import '../../../styles/prototype-shell.css';
import '../../../styles/prototype-components.css';
import '../../../styles/prototype-editor.css';
import '../../../styles/prototype-design-gallery.css';
import {
  DESIGN_SYSTEM_CORE_SCENES,
  isDesignSystemCoreScene,
  type DesignSystemScene,
  type DesignSystemScenePhase,
} from './sceneRegistry';
import DesignSystemScenePreview from './DesignSystemScenePreview';
import {
  DEFAULT_DESIGN_SCENE_ID,
  sceneById as sharedSceneById,
  SHARED_SPACES_DESIGN_SCENES,
  type SharedSpacesDesignScene,
} from '../shared-spaces-design/sceneRegistry';
import SharedSpacesDesignScenePreview from '../shared-spaces-design/SharedSpacesDesignScenePreview';
import { HarvousLogoMark } from '../../public/public-shared';

const PHASE_ORDER: DesignSystemScenePhase[] = [
  'Foundations',
  'Primitives',
  'Patterns',
  'Acquire',
  'Shell',
  'Collaboration',
  'Confirms',
];

type GalleryScene = DesignSystemScene | SharedSpacesDesignScene;

function allScenes(): GalleryScene[] {
  return [...DESIGN_SYSTEM_CORE_SCENES, ...SHARED_SPACES_DESIGN_SCENES];
}

function resolveScene(sceneId: string | undefined): GalleryScene {
  const scenes = allScenes();
  return scenes.find((s) => s.id === sceneId) ?? DESIGN_SYSTEM_CORE_SCENES[0] ?? sharedSceneById(DEFAULT_DESIGN_SCENE_ID)!;
}

export default function DesignSystemGalleryPage() {
  const navigate = useNavigate();
  const { scene: sceneId } = useSearch({ strict: false }) as { scene?: string };
  const active = resolveScene(sceneId);

  function selectScene(next: GalleryScene) {
    void navigate({ to: '/__dev/design-system', search: { scene: next.id }, replace: true });
  }

  const byPhase = PHASE_ORDER.map((phase) => ({
    phase,
    scenes: allScenes().filter((s) => s.phase === phase),
  })).filter((group) => group.scenes.length > 0);

  return (
    <div className="proto-theme pds-gallery">
      <aside className="pds-gallery__nav">
        <div className="pds-gallery__brand">
          <div className="pds-gallery__brand-pill" aria-label="Harvous design system">
            <span className="pds-gallery__brand-mark">
              <HarvousLogoMark size={28} />
            </span>
            <div className="pds-gallery__brand-copy">
              <p className="pds-gallery__brand-title">Design system</p>
              <p className="pds-gallery__brand-subtitle">Live previews · dev only</p>
            </div>
          </div>
          <h1 className="pds-gallery__sr-only">Harvous design system</h1>
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

        <div className="pds-gallery__canvas">
          {isDesignSystemCoreScene(active.id) ? (
            <DesignSystemScenePreview scene={active as DesignSystemScene} />
          ) : (
            <SharedSpacesDesignScenePreview scene={active as SharedSpacesDesignScene} />
          )}
        </div>

        <p className="pds-caption pds-gallery__tip">
          Tip: open this URL beside CSS in Cursor&apos;s browser panel. Changes hot-reload. Shared Spaces-only gallery:{' '}
          <code>/__dev/shared-spaces-design</code>
        </p>
      </main>
    </div>
  );
}

export type DesignSystemGallerySearch = { scene?: string };
