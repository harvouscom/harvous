import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { isDedicatedPrototypeHost, prototypeHomeRouteTo } from '@/lib/prototype-path';
import { reportRouteBoundaryError } from '@/utils/diagnostics-client';
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

  useEffect(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    reportRouteBoundaryError(error);
  }, [error]);

  const detail = errorMessage(error);

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
