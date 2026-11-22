import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, onWsMessage } from '../lib/api';
import type { AnalyticsData } from '../types';

export function useAnalytics() {
  const queryClient = useQueryClient();

  // Invalidate analytics cache whenever the server broadcasts an update
  useEffect(() => {
    const unsub = onWsMessage((msg) => {
      if (msg.type === 'analytics:updated') {
        queryClient.invalidateQueries({ queryKey: ['analytics'] });
      }
    });
    return () => { unsub(); };
  }, [queryClient]);

  return useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => api.get('/analytics').then(r => r.data),
    refetchInterval: 60_000, // Fallback polling every 60s
    staleTime: 10_000,
  });
}
