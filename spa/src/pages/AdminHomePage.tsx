import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';
import { isDedicatedPrototypeHost } from '@/lib/prototype-path';
import PrototypeMainPaneShell from './prototype/PrototypeMainPaneShell';
import PrototypeAdminEmptyState from './prototype/PrototypeAdminEmptyState';

function PrototypeAdminHomePage() {
  const navigate = useNavigate();
  const admin = useHarvousAdminCheck();

  useEffect(() => {
    if (admin.isError || (admin.isSuccess && admin.data && !admin.data.isAdmin)) {
      navigate({ to: '/' });
    }
  }, [admin.isError, admin.isSuccess, admin.data, navigate]);

  if (admin.isLoading) {
    return (
      <>
        <PrototypeMainPaneShell>{null}</PrototypeMainPaneShell>
        <ProtoStatusChip visible variant="syncing" label="Loading…" />
      </>
    );
  }

  if (!admin.data?.isAdmin) {
    return null;
  }

  return (
    <PrototypeMainPaneShell>
      <PrototypeAdminEmptyState />
    </PrototypeMainPaneShell>
  );
}

function ClassicAdminHomePage() {
  const navigate = useNavigate();
  const admin = useHarvousAdminCheck();

  useEffect(() => {
    if (admin.isError || (admin.isSuccess && admin.data && !admin.data.isAdmin)) {
      navigate({ to: '/' });
    }
  }, [admin.isError, admin.isSuccess, admin.data, navigate]);

  if (admin.isLoading) {
    return <ProtoStatusChip visible variant="syncing" label="Loading…" />;
  }

  if (!admin.data?.isAdmin) {
    return null;
  }

  return (
    <div className="page-flex-column">
      <div className="page-flex-column__main" style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
        <PrototypeAdminEmptyState />
      </div>
    </div>
  );
}

export default function AdminHomePage() {
  return isDedicatedPrototypeHost() ? <PrototypeAdminHomePage /> : <ClassicAdminHomePage />;
}
