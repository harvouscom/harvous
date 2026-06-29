import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import AdminSupportPanel from '@/components/react/AdminSupportPanel';
import AdminShell from '@/components/react/AdminShell';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';
import { isDedicatedPrototypeHost } from '@/lib/prototype-path';
import CardStack from '../components/CardStack';
import '@/styles/admin-usage.css';
import '@/styles/admin-support.css';

function PrototypeAdminSupportPage() {
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
        <AdminShell title="Support">{null}</AdminShell>
        <ProtoStatusChip visible variant="syncing" label="Loading…" />
      </>
    );
  }

  if (!admin.data?.isAdmin) {
    return null;
  }

  return (
    <AdminShell title="Support" subtitle="User feedback from the support form.">
      <AdminSupportPanel />
    </AdminShell>
  );
}

function ClassicAdminSupportPage() {
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
            <CardStack title="Support" centerTitle />
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
        <CardStack title="Support" centerTitle>
          <div style={{ padding: '0 14px 24px' }}>
            <AdminSupportPanel />
          </div>
        </CardStack>
      </div>
    </div>
  );
}

export default function AdminSupportPage() {
  return isDedicatedPrototypeHost() ? <PrototypeAdminSupportPage /> : <ClassicAdminSupportPage />;
}
