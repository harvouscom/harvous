import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import AdminReportsPanel from '@/components/react/AdminReportsPanel';
import AdminShell from '@/components/react/AdminShell';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';
import { isDedicatedPrototypeHost } from '@/lib/prototype-path';
import CardStack from '../components/CardStack';
import '@/styles/admin-usage.css';
import '@/styles/admin-reports.css';

function PrototypeAdminReportsPage() {
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
        <AdminShell title="Reports">{null}</AdminShell>
        <ProtoStatusChip visible variant="syncing" label="Loading…" />
      </>
    );
  }

  if (!admin.data?.isAdmin) {
    return null;
  }

  return (
    <AdminShell title="Reports" subtitle="Monthly Usage and Pulse snapshots by season and year.">
      <AdminReportsPanel />
    </AdminShell>
  );
}

function ClassicAdminReportsPage() {
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
            <CardStack title="Reports" centerTitle />
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
        <CardStack title="Reports" centerTitle>
          <div style={{ padding: '0 14px 24px' }}>
            <AdminReportsPanel />
          </div>
        </CardStack>
      </div>
    </div>
  );
}

export default function AdminReportsPage() {
  return isDedicatedPrototypeHost() ? <PrototypeAdminReportsPage /> : <ClassicAdminReportsPage />;
}
