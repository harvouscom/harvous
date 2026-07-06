/**
 * Dev-only design gallery for Shared Spaces UX touch points.
 * Open http://localhost:4322/__dev/shared-spaces-design while `npm run dev` runs.
 * Edit linked CSS/components — previews hot-reload.
 */
import { useNavigate, useSearch } from '@tanstack/react-router';
import '../../styles/prototype-shell.css';
import '../../styles/prototype-components.css';
import '../../styles/prototype-editor.css';
import {
  DEFAULT_DESIGN_SCENE_ID,
  sceneById,
  SHARED_SPACES_DESIGN_SCENES,
  type SharedSpacesDesignScene,
} from './shared-spaces-design/sceneRegistry';
import SharedSpacesDesignScenePreview from './shared-spaces-design/SharedSpacesDesignScenePreview';

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
    <div
      className="proto-theme"
      style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        minHeight: '100vh',
        background: 'var(--pds-bg-canvas)',
        color: 'var(--pds-text-primary)',
      }}
    >
      <aside
        style={{
          borderRight: '0.5px solid var(--pds-border)',
          background: 'var(--pds-bg-sidebar)',
          overflowY: 'auto',
          padding: '16px 12px 32px',
        }}
      >
        <h1 className="pds-subheadline" style={{ margin: '0 0 4px', fontWeight: 600 }}>
          Shared Spaces design
        </h1>
        <p className="pds-caption" style={{ margin: '0 0 16px', color: 'var(--pds-text-secondary)' }}>
          Live previews · dev only
        </p>
        {byPhase.map(({ phase, scenes }) => (
          <div key={phase} style={{ marginBottom: 16 }}>
            <p className="pds-footnote" style={{ margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {phase}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {scenes.map((scene) => (
                <li key={scene.id}>
                  <button
                    type="button"
                    onClick={() => selectScene(scene)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: 'none',
                      cursor: 'pointer',
                      font: 'inherit',
                      fontSize: 13,
                      background: scene.id === active.id ? 'var(--pds-fill-secondary)' : 'transparent',
                      color: 'var(--pds-text-primary)',
                    }}
                  >
                    {scene.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <main style={{ overflowY: 'auto', padding: '20px 24px 48px' }}>
        <header style={{ marginBottom: 20 }}>
          <p className="pds-caption" style={{ margin: '0 0 4px', color: 'var(--pds-text-secondary)' }}>
            {active.phase} · {active.id}
          </p>
          <h2 className="pds-list-title" style={{ margin: '0 0 8px', fontSize: 20 }}>
            {active.title}
          </h2>
          <p className="pds-caption" style={{ margin: 0, color: 'var(--pds-text-secondary)' }}>
            Edit:{' '}
            {active.editFiles.map((file, i) => (
              <span key={file}>
                {i > 0 ? ', ' : null}
                <code style={{ fontSize: 11 }}>{file}</code>
              </span>
            ))}
          </p>
        </header>

        <div
          style={{
            background: 'var(--pds-bg-popover-solid)',
            borderRadius: 16,
            border: '0.5px solid var(--pds-border)',
            padding: 24,
            minHeight: 360,
          }}
        >
          <SharedSpacesDesignScenePreview scene={active} />
        </div>

        <p className="pds-caption" style={{ marginTop: 16, color: 'var(--pds-text-secondary)' }}>
          Tip: split this URL in Cursor&apos;s browser panel beside your CSS. Changes hot-reload.
          {' '}
          For the full dashboard inside the live shell, open{' '}
          <code style={{ fontSize: 11 }}>?sharedSpaceFixture=full</code> on localhost and tap the space orb (H).
        </p>
      </main>
    </div>
  );
}

/** Route search typing helper */
export type SharedSpacesDesignSearch = { scene?: string };
