import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import AdminMaintenancePanel from '@/components/react/AdminMaintenancePanel';
import AdminShell from '@/components/react/AdminShell';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';
import { isDedicatedPrototypeHost } from '@/lib/prototype-path';
import CardStack from '../components/CardStack';
import '@/styles/admin-usage.css';

function PrototypeAdminMaintenancePage() {
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
        <AdminShell title="Maintenance">{null}</AdminShell>
        <ProtoStatusChip visible variant="syncing" label="Loading…" />
      </>
    );
  }

  if (!admin.data?.isAdmin) {
    return null;
  }

  return (
    <AdminShell title="Maintenance" subtitle="Platform jobs and data repairs." variant="report">
      <AdminMaintenancePanel />
    </AdminShell>
  );
}

function ClassicAdminMaintenancePage() {
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
        <div className="page-flex-column">
          <div className="page-flex-column__main">
            <CardStack title="Maintenance" centerTitle />
          </div>
        </div>
        <ProtoStatusChip visible variant="syncing" label="Loading…" />
      </>
    );
  }

  if (!admin.data?.isAdmin) {
    return null;
  }

  return (
    <div className="page-flex-column">
      <div className="page-flex-column__main">
        <CardStack title="Maintenance" centerTitle>
          <div style={{ padding: '0 14px 24px' }}>
            <AdminMaintenancePanel />
          </div>
        </CardStack>
      </div>
    </div>
  );
}

export default function AdminMaintenancePage() {
  return isDedicatedPrototypeHost() ? <PrototypeAdminMaintenancePage /> : <ClassicAdminMaintenancePage />;
}
