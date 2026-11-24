import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { IngestionJob } from '../types';

/**
 * Polls a BullMQ ingestion job until it reaches a terminal state (DONE | FAILED).
 * Automatically stops polling once the job completes.
 */
export function useJobPoller(jobId: string | null) {
  return useQuery<IngestionJob>({
    queryKey: ['job', jobId],
    queryFn: () => api.get('/upload/job/' + jobId).then(r => r.data),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'DONE' || status === 'FAILED' || status === 'AWAITING_REVIEW' || status === 'CANCELLED') return false;
      return 1500; // Poll every 1.5s while in-flight
    },
  });
}
