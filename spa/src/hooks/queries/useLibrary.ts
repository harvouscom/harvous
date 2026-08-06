import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export type LibraryItem = {
  id: string;
  libraryId: string;
  /** 'link' | 'file' — other kinds are future (RESOURCE_LIBRARY.md §6). */
  kind: string;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceSiteName: string | null;
  sourceImage: string | null;
  fileName: string | null;
  fileMime: string | null;
  fileBytes: number | null;
  createdAt: string | Date;
  updatedAt: string | Date | null;
};

export type LibraryResponse = {
  /** Null until the viewer saves their first item — libraries are created lazily. */
  library: { id: string; ownerKind: string; title: string } | null;
  items: LibraryItem[];
};

/** OG metadata for a pasted URL, as returned by /api/resource/metadata. */
export type LibraryLinkPreview = {
  title: string;
  description: string;
  image: string;
  url: string;
  siteName: string | null;
};

export const LIBRARY_QUERY_KEY = ['library'] as const;

/**
 * The viewer's personal resource library.
 *
 * Personal even while a shared space is open — church-owned libraries and the
 * union view land with the church lane (docs/future/RESOURCE_LIBRARY.md §5.1).
 */
export function useLibrary() {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: LIBRARY_QUERY_KEY,
    enabled: authReady,
    queryFn: async () => api.get<LibraryResponse>('/api/library'),
  });
}

/** Fetch OG metadata for a pasted URL so the user confirms a titled card, not a raw link. */
export function useLibraryLinkPreview() {
  return useMutation({
    mutationFn: async (url: string) => {
      const res = await api.post<{ success: boolean; metadata: LibraryLinkPreview }>(
        '/api/resource/metadata',
        { url },
      );
      return res.metadata;
    },
  });
}

export function useCreateLibraryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      url: string;
      title?: string;
      description?: string;
      siteName?: string | null;
      image?: string | null;
    }) =>
      api.post<{ success: boolean; duplicate: boolean; item: LibraryItem }>(
        '/api/library/items/create',
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
    },
  });
}

export function useUploadLibraryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; title?: string }) => {
      const form = new FormData();
      form.append('file', input.file);
      if (input.title?.trim()) form.append('title', input.title.trim());
      return api.post<{ success: boolean; item: LibraryItem }>('/api/library/items/upload', form);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
    },
  });
}

/**
 * Resolve a file item to a short-lived signed URL and open it.
 *
 * Minted per click on purpose — the URL expires in minutes, so nothing durable
 * to a private file ever lands in a note, the dock, or browser history.
 */
export async function openLibraryFileItem(itemId: string): Promise<boolean> {
  try {
    const res = await api.get<{ url: string }>(
      `/api/library/items/${encodeURIComponent(itemId)}/file`,
    );
    if (!res.url) return false;
    window.open(res.url, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}

export function useArchiveLibraryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      api.post<{ success: boolean }>('/api/library/items/archive', { id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
    },
  });
}
