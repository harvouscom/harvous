import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface PrototypeMigrationResult {
  success: boolean;
  collectionsUpdated: number;
  connectionsMigrated: number;
  connectionsSkipped: number;
  showFoldersBanner: boolean;
}

export function usePrototypeMigration() {
  return useMutation({
    mutationFn: () => api.post<PrototypeMigrationResult>('/api/user/migrate-to-prototype'),
  });
}

export interface PrototypeMigrationStatus {
  success: boolean;
  needsCollectionBackfill: boolean;
}

export async function fetchPrototypeMigrationStatus(): Promise<PrototypeMigrationStatus> {
  return api.get<PrototypeMigrationStatus>('/api/user/migrate-to-prototype/status');
}
