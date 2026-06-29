import { useNavigate, useRouter } from '@tanstack/react-router';
import { isDedicatedPrototypeHost, prototypeHomeRouteTo } from '@/lib/prototype-path';
import PrototypeMainPaneShell from './prototype/PrototypeMainPaneShell';
import PrototypePaneEmptyState from './prototype/PrototypePaneEmptyState';

export default function NotFoundPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const onPrototypeHost = isDedicatedPrototypeHost();

  const pane = (
    <PrototypePaneEmptyState
      icon="circle-info"
      title="Page not found"
      description="The page you're looking for doesn't exist or may have been moved."
      action={{
        label: 'Go home',
        onClick: () => {
          if (onPrototypeHost) {
            void navigate({ to: prototypeHomeRouteTo() });
          } else {
            void router.navigate({ to: '/' });
          }
        },
      }}
    />
  );

  if (onPrototypeHost) {
    return <PrototypeMainPaneShell>{pane}</PrototypeMainPaneShell>;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '60vh',
        padding: '2rem',
      }}
    >
      {pane}
    </div>
  );
}
