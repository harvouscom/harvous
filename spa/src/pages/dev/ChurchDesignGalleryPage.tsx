/**
 * Dev-only design gallery for church-org UX touch points.
 * Open http://localhost:4322/__dev/church-design while `npm run dev` runs.
 * Edit linked CSS/components — previews hot-reload.
 *
 * Kept separate from the Shared Spaces gallery: that scene list backs the
 * release-verification screenshots, and church org must not touch the
 * shared-spaces release surface.
 */
import { useNavigate, useSearch } from '@tanstack/react-router';
import '../../styles/prototype-shell.css';
import '../../styles/prototype-components.css';
import '../../styles/prototype-editor.css';
import '../../styles/prototype-design-gallery.css';
import {
  CHURCH_DESIGN_SCENES,
  DEFAULT_CHURCH_SCENE_ID,
  churchSceneById,
  type ChurchDesignScene,
} from './church-design/sceneRegistry';
import ChurchDesignScenePreview from './church-design/ChurchDesignScenePreview';
import { HarvousLogoMark } from '../public/public-shared';

const PHASE_ORDER = ['Admin', 'Connect', 'Receive', 'Staff'] as const;

const PHASE_NOTE: Record<(typeof PHASE_ORDER)[number], string> = {
  Admin: 'Built today',
  Connect: 'Not built',
  Receive: 'Not built',
  Staff: 'Not built',
};

export default function ChurchDesignGalleryPage() {
  const navigate = useNavigate();
  const { scene: sceneId } = useSearch({ strict: false }) as { scene?: string };
  const active = churchSceneById(sceneId) ?? churchSceneById(DEFAULT_CHURCH_SCENE_ID)!;

  function selectScene(next: ChurchDesignScene) {
    void navigate({ to: '/__dev/church-design', search: { scene: next.id }, replace: true });
  }

  const byPhase = PHASE_ORDER.map((phase) => ({
    phase,
    scenes: CHURCH_DESIGN_SCENES.filter((s) => s.phase === phase),
  }));

  return (
    <div className="proto-theme pds-gallery">
      <aside className="pds-gallery__nav">
        <div className="pds-gallery__brand">
          <div className="pds-gallery__brand-pill" aria-label="Church org design">
            <span className="pds-gallery__brand-mark">
              <HarvousLogoMark size={28} />
            </span>
            <div className="pds-gallery__brand-copy">
              <p className="pds-gallery__brand-title">Church org</p>
              <p className="pds-gallery__brand-subtitle">Live previews · dev only</p>
            </div>
          </div>
          <h1 className="pds-gallery__sr-only">Church org design</h1>
        </div>
        {byPhase.map(({ phase, scenes }) => (
          <div key={phase} className="pds-gallery__phase">
            <p className="pds-footnote pds-gallery__phase-label">
              {phase} · {PHASE_NOTE[phase]}
            </p>
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
            {active.speculative ? ' · mockup (unbuilt)' : ' · shipped'}
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

        <div className="pds-gallery__canvas" data-testid="church-scene-preview">
          <ChurchDesignScenePreview scene={active} />
        </div>

        <p className="pds-caption pds-gallery__tip">
          Admin scenes mirror the shipped <code>/admin/churches</code> page. Receive/Staff mockups show{' '}
          <strong>ministry education channels</strong> (not announcements). Vision:{' '}
          <code>docs/future/CHURCH_ORG_AND_CURRICULUM.md</code>. Shared Spaces gallery:{' '}
          <code>/__dev/shared-spaces-design</code>
        </p>
      </main>
    </div>
  );
}

/** Route search typing helper */
export type ChurchDesignSearch = { scene?: string };
