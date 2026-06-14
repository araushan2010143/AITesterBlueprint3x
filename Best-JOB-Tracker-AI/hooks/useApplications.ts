'use client';

import useSWR from 'swr';
import type { Application } from '@/types';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Fetch failed');
    return r.json();
  });

export function useApplications(status?: string, search?: string) {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (search) params.set('search', search);

  const key = `/api/applications?${params.toString()}`;

  const { data, error, mutate, isLoading } = useSWR<{ data: Application[] }>(
    key,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  // Instant local update → server PATCH in background → rollback on failure
  async function updateStatus(id: string, newStatus: Application['status']) {
    const snapshot = data; // capture for rollback

    // 1. Update cache synchronously — card moves before any network call
    mutate(
      { data: (data?.data ?? []).map((a) =>
          a.id === id ? { ...a, status: newStatus, updated_at: new Date().toISOString() } : a
        ),
      },
      { revalidate: false }
    );

    // 2. Persist to server
    const res = await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });

    if (!res.ok) {
      // 3. Rollback to snapshot if server rejected
      mutate(snapshot, { revalidate: false });
      throw new Error('Server rejected status update');
    }
  }

  async function deleteApplication(id: string) {
    const snapshot = data;
    mutate(
      { data: (data?.data ?? []).filter((a) => a.id !== id) },
      { revalidate: false }
    );
    const res = await fetch(`/api/applications/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      mutate(snapshot, { revalidate: false });
      throw new Error('Delete failed');
    }
  }

  async function createApplication(payload: Partial<Application>) {
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create application');
    const created = await res.json();
    mutate(
      { data: [created.data, ...(data?.data ?? [])] },
      { revalidate: false }
    );
    return created;
  }

  return {
    applications: data?.data ?? [],
    isLoading,
    error,
    mutate,
    updateStatus,
    deleteApplication,
    createApplication,
  };
}
