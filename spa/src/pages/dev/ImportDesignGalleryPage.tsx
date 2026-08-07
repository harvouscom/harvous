/**
 * Dev-only design gallery for the import surface.
 * Open http://localhost:4322/__dev/import-design while `npm run dev` runs.
 * Edit the linked components or CSS — previews hot-reload.
 *
 * The point of this page: import has states you cannot reach on demand. Reproducing
 * a rate-limit pause, a half-failed Evernote notebook, or a 22-row queue means
 * finding the right broken file and the right moment. Here they are all one click apart.
 */
import { useNavigate, useSearch } from '@tanstack/react-router';
import '../../styles/prototype-shell.css';
import '../../styles/prototype-components.css';
import '../../styles/prototype-editor.css';
import '../../styles/prototype-design-gallery.css';
import {
  DEFAULT_IMPORT_SCENE_ID,
  IMPORT_DESIGN_SCENES,
  importSceneById,
  type ImportDesignScene,
} from './import-design/sceneRegistry';
import ImportDesignScenePreview from './import-design/ImportDesignScenePreview';
import { HarvousLogoMark } from '../public/public-shared';

const GROUP_ORDER = ['Entry', 'Review', 'Running', 'Trouble', 'Done', 'Parts'] as const;

const GROUP_NOTE: Record<(typeof GROUP_ORDER)[number], string> = {
  Entry: 'Before anything is dropped',
  Review: 'Parsed, waiting on the user',
  Running: 'The import is working',
  Trouble: 'Limits, stops, failures',
  Done: 'The summary',
  Parts: 'Primitives in isolation',
};

export default function ImportDesignGalleryPage() {
  const navigate = useNavigate();
  const { scene: sceneId } = useSearch({ strict: false }) as { scene?: string };
  const active = importSceneById(sceneId) ?? importSceneById(DEFAULT_IMPORT_SCENE_ID)!;

  function selectScene(next: ImportDesignScene) {
    void navigate({ to: '/__dev/import-design', search: { scene: next.id }, replace: true });
  }

  const byGroup = GROUP_ORDER.map((group) => ({
    group,
    scenes: IMPORT_DESIGN_SCENES.filter((s) => s.group === group),
  }));

  return (
    <div className="proto-theme pds-gallery">
      <aside className="pds-gallery__nav">
        <div className="pds-gallery__brand">
          <div className="pds-gallery__brand-pill" aria-label="Import design">
            <span className="pds-gallery__brand-mark">
              <HarvousLogoMark size={28} />
            </span>
            <div className="pds-gallery__brand-copy">
              <p className="pds-gallery__brand-title">Import</p>
              <p className="pds-gallery__brand-subtitle">Live previews · dev only</p>
            </div>
          </div>
          <h1 className="pds-gallery__sr-only">Import design</h1>
        </div>
        {byGroup.map(({ group, scenes }) => (
          <div key={group} className="pds-gallery__phase">
            <p className="pds-footnote pds-gallery__phase-label">
              {group} · {GROUP_NOTE[group]}
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
            {active.group} · {active.id}
          </p>
          <h2 className="pds-list-title pds-gallery__heading">{active.title}</h2>
          {active.note ? <p className="pds-caption pds-gallery__meta">{active.note}</p> : null}
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

        <div className="pds-gallery__canvas" data-testid="import-scene-preview">
          <ImportDesignScenePreview scene={active} />
        </div>

        <p className="pds-caption pds-gallery__tip">
          These render the real components with fixture state, so CSS edits land here first. The live
          surface is <code>/prototype/import</code>; the queue rules it follows are unit-tested in{' '}
          <code>spa/src/pages/prototype/import/__tests__/import-engine-state.test.ts</code>.
        </p>
      </main>
    </div>
  );
}

/** Route search typing helper */
export type ImportDesignSearch = { scene?: string };
