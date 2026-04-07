import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import CardStack from '../components/CardStack';
import AdminVotdPanel from '@/components/react/AdminVotdPanel';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';

export default function AdminVotdPage() {
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
          <CardStack title="Verse of the Day" centerTitle>
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
        <CardStack title="Verse of the Day" centerTitle>
          <AdminVotdPanel variant="embed" />
        </CardStack>
      </div>
    </div>
  );
}
