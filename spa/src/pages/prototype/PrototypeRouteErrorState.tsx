import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { isDedicatedPrototypeHost, prototypeHomeRouteTo } from '@/lib/prototype-path';
import { reportRouteBoundaryError } from '@/utils/diagnostics-client';
import { isStaleBuild } from '@/utils/build-freshness';
import { reloadPrototypeAfterUpdate } from '@/utils/prototype-app-update-notice';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypePaneEmptyState from './PrototypePaneEmptyState';
import PrototypeSupportSheet from './PrototypeSupportSheet';

type Props = {
  error: unknown;
  reset: () => void;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export default function PrototypeRouteErrorState({ error, reset }: Props) {
  const navigate = useNavigate();
  const reportedRef = useRef(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [staleBuild, setStaleBuild] = useState(false);

  /*
   * Ask whether this bundle is still the deployed one before blaming the code.
   *
   * A crash in a client the deploy has moved on from is not a bug the reader can help with by
   * filing it, and "Try again" re-renders the same stale component. Reloading is the actual
   * fix, so offer that instead. The answer also rides along on the report, so the admin list
   * can tell a skew crash from a real one rather than showing both as the same mystery.
   */
  useEffect(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    let cancelled = false;
    void isStaleBuild().then((stale) => {
      if (!cancelled && stale) setStaleBuild(true);
      reportRouteBoundaryError(error, stale ? { staleBuild: true } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [error]);

  const detail = errorMessage(error);

  if (staleBuild) {
    const stalePane = (
      <PrototypePaneEmptyState
        className="proto-editor-empty-state--route-error"
        role="alert"
        title="Harvous was updated"
        description={
          <p className="proto-editor-empty-state__line">
            This tab is still running an older version. Reload to pick up the latest.
          </p>
        }
        action={{ label: 'Reload', onClick: reloadPrototypeAfterUpdate }}
      />
    );
    return isDedicatedPrototypeHost() ? (
      <PrototypeMainPaneShell>{stalePane}</PrototypeMainPaneShell>
    ) : (
      <div className="page-flex-column">
        <div className="page-flex-column__main proto-route-error-host">{stalePane}</div>
      </div>
    );
  }

  const pane = (
    <>
      <PrototypePaneEmptyState
        className="proto-editor-empty-state--route-error"
        role="alert"
        leading={
          <div className="proto-detail-card proto-pane-empty-state__error-card">
            <Icon name="circle-exclamation" size={18} className="proto-detail-card__icon" aria-hidden />
            <p className="pds-list-preview proto-detail-card__text">{detail}</p>
          </div>
        }
        title="Whoops..."
        description={
          <p className="proto-editor-empty-state__line">
            We&apos;ve noted this error and sent this anonymously to us to help fix ASAP.
          </p>
        }
        action={{ label: 'Try again', onClick: reset }}
        secondaryAction={{ label: 'Get support', onClick: () => setSupportOpen(true) }}
        tertiaryAction={{
          label: 'Go home',
          onClick: () => {
            void navigate({ to: prototypeHomeRouteTo() });
          },
        }}
      />
      <PrototypeSupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} initialTopic="Bug" />
    </>
  );

  if (isDedicatedPrototypeHost()) {
    return <PrototypeMainPaneShell>{pane}</PrototypeMainPaneShell>;
  }

  return (
    <div className="page-flex-column">
      <div className="page-flex-column__main proto-route-error-host">{pane}</div>
    </div>
  );
}
