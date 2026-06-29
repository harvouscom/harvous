import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import AdminUsagePanel from '@/components/react/AdminUsagePanel';
import AdminShell from '@/components/react/AdminShell';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';
import { isDedicatedPrototypeHost } from '@/lib/prototype-path';
import CardStack from '../components/CardStack';
import '@/styles/admin-usage.css';

function PrototypeAdminUsagePage() {
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
        <AdminShell title="Usage">{null}</AdminShell>
        <ProtoStatusChip visible variant="syncing" label="Loading…" />
      </>
    );
  }

  if (!admin.data?.isAdmin) {
    return null;
  }

  return (
    <AdminShell
      title="Usage"
      subtitle="Accounts, engagement, recall, and rewards."
      variant="report"
    >
      <AdminUsagePanel />
    </AdminShell>
  );
}

function ClassicAdminUsagePage() {
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
            <CardStack title="Usage dashboard" centerTitle />
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
        <CardStack title="Usage dashboard" centerTitle>
          <div style={{ padding: '0 14px 24px' }}>
            <AdminUsagePanel />
          </div>
        </CardStack>
      </div>
    </div>
  );
}

export default function AdminUsagePage() {
  return isDedicatedPrototypeHost() ? <PrototypeAdminUsagePage /> : <ClassicAdminUsagePage />;
}
