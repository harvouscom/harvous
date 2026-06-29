import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import CardStack from '../components/CardStack';
import AdminVotdPanel from '@/components/react/AdminVotdPanel';
import AdminShell from '@/components/react/AdminShell';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';
import { isDedicatedPrototypeHost } from '@/lib/prototype-path';

function PrototypeAdminVotdPage() {
  const navigate = useNavigate();
  const admin = useHarvousAdminCheck();

  useEffect(() => {
    if (admin.isError || (admin.isSuccess && admin.data && !admin.data.isAdmin)) {
      navigate({ to: '/' });
    }
  }, [admin.isError, admin.isSuccess, admin.data, navigate]);

  if (admin.isLoading) {
    return (
      <AdminShell title="Today's Passage" subtitle="Checking access…">
        <p className="admin-votd__muted">Checking access…</p>
      </AdminShell>
    );
  }

  if (!admin.data?.isAdmin) {
    return null;
  }

  return (
    <AdminShell
      title="Today's Passage"
      subtitle="Editorial preview and schedule overrides (UTC dates)."
    >
      <AdminVotdPanel variant="embed" />
    </AdminShell>
  );
}

function ClassicAdminVotdPage() {
  const navigate = useNavigate();
  const admin = useHarvousAdminCheck();

  useEffect(() => {
    if (admin.isError || (admin.isSuccess && admin.data && !admin.data.isAdmin)) {
      navigate({ to: '/' });
    }
  }, [admin.isError, admin.isSuccess, admin.data, navigate]);

  if (admin.isLoading) {
    return (
      <div className="page-flex-column">
        <div className="page-flex-column__main">
          <CardStack title="Today's Passage" centerTitle>
            <p className="admin-votd__muted">Checking access…</p>
          </CardStack>
        </div>
      </div>
    );
  }

  if (!admin.data?.isAdmin) {
    return null;
  }

  return (
    <div className="page-flex-column">
      <div className="page-flex-column__main">
        <CardStack title="Today's Passage" centerTitle>
          <AdminVotdPanel variant="embed" />
        </CardStack>
      </div>
    </div>
  );
}

export default function AdminVotdPage() {
  return isDedicatedPrototypeHost() ? <PrototypeAdminVotdPage /> : <ClassicAdminVotdPage />;
}
