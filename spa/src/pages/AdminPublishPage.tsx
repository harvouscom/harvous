import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import AdminPublishPanel from '@/components/react/AdminPublishPanel';
import AdminShell from '@/components/react/AdminShell';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';
import { isDedicatedPrototypeHost } from '@/lib/prototype-path';
import CardStack from '../components/CardStack';
import '@/styles/admin-usage.css';

function PrototypeAdminPublishPage() {
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
        <AdminShell title="Publish">{null}</AdminShell>
        <ProtoStatusChip visible variant="syncing" label="Loading…" />
      </>
    );
  }

  if (!admin.data?.isAdmin) {
    return null;
  }

  return (
    <AdminShell title="Publish" subtitle="Curated spaces, threads, and share links." variant="report">
      <AdminPublishPanel />
    </AdminShell>
  );
}

function ClassicAdminPublishPage() {
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
            <CardStack title="Publish" centerTitle />
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
        <CardStack title="Publish" centerTitle>
          <div style={{ padding: '0 14px 24px' }}>
            <AdminPublishPanel />
          </div>
        </CardStack>
      </div>
    </div>
  );
}

export default function AdminPublishPage() {
  return isDedicatedPrototypeHost() ? <PrototypeAdminPublishPage /> : <ClassicAdminPublishPage />;
}
