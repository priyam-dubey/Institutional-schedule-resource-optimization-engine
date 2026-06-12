import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader, Card, Badge, Skeleton } from '../ui';
import { Database, Zap, ListTodo, Shield, CheckCircle, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import type { Role } from '../../types';

interface HealthData {
  status: string;
  timestamp: string;
  correlationId: string;
  uptime: string;
  services: {
    database: { status: string; latency: string; provider: string; error?: string };
    redis:    { status: string; latency: string; memory: string;   error?: string };
    queues: {
      'csv-import':           { waiting: number; active: number; completed: number; failed: number };
      'pdf-parse':            { waiting: number; active: number; completed: number; failed: number };
      'analytics-recompute':  { waiting: number; active: number; completed: number; failed: number };
    };
  };
}

const ROLES: { role: Role; level: number; label: string; icon: string; perms: string }[] = [
  { role: 'ADMIN',       level: 5, label: 'Admin',       icon: '👑', perms: 'Full access · View soft-deleted users' },
  { role: 'DEAN',        level: 4, label: 'Dean',        icon: '🎓', perms: 'Read + approve all departments' },
  { role: 'HOD',         level: 3, label: 'HOD',         icon: '🏛',  perms: 'Delete entities within department' },
  { role: 'COORDINATOR', level: 2, label: 'Coordinator', icon: '📋', perms: 'Full CRUD · Manage timetable · Trigger imports' },
  { role: 'PROFESSOR',   level: 1, label: 'Professor',   icon: '👨‍🏫', perms: 'Read-only access' },
];

function ServiceCard({
  title, icon: Icon, status, latency, extra,
}: {
  title: string;
  icon: React.ElementType;
  status: string;
  latency?: string;
  extra?: React.ReactNode;
}) {
  const up = status === 'up';
  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <Icon className="w-5 h-5 text-slate-600" />
        </div>
        {up
          ? <Badge color="green" dot>Connected</Badge>
          : <Badge color="red"   dot>Down</Badge>}
      </div>
      <div className="text-sm font-bold text-slate-700 mb-0.5">{title}</div>
      {latency && <div className="text-xs text-slate-400">Latency: <strong className="text-slate-600">{latency}</strong></div>}
      {extra}
    </Card>
  );
}

export default function HealthPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () => api.get('/health').then(r => r.data),
    refetchInterval: 10_000,
  });

  const lastChecked = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  return (
    <div>
      <PageHeader title="System Health Monitor"
        subtitle={'Last checked: ' + lastChecked + ' · Auto-refresh every 10s'}
        actions={
          data && (
            <Badge color={data.status === 'healthy' ? 'green' : 'red'} dot>
              {data.status === 'healthy' ? 'All systems operational' : 'Degraded'}
            </Badge>
          )
        }
      />

      {/* Service cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {isLoading ? Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><Skeleton className="h-24 w-full" /></Card>
        )) : (
          <>
            <ServiceCard
              title="PostgreSQL" icon={Database}
              status={data?.services.database.status ?? 'unknown'}
              latency={data?.services.database.latency}
              extra={<div className="text-xs text-slate-400 mt-1">Provider: {data?.services.database.provider}</div>}
            />
            <ServiceCard
              title="Redis" icon={Zap}
              status={data?.services.redis.status ?? 'unknown'}
              latency={data?.services.redis.latency}
              extra={<div className="text-xs text-slate-400 mt-1">Memory: {data?.services.redis.memory}</div>}
            />
            <ServiceCard
              title="BullMQ Workers" icon={ListTodo}
              status="up"
              extra={
                <div className="mt-2 space-y-1">
                  {Object.entries(data?.services.queues ?? {}).map(([name, counts]) => (
                    <div key={name} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-mono truncate max-w-[120px]">{name}</span>
                      <div className="flex gap-2">
                        {counts.active > 0
                          ? <Badge color="amber">active: {counts.active}</Badge>
                          : <Badge color="green">idle</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              }
            />
          </>
        )}
      </div>

      {/* Uptime & Corr ID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">System Info</div>
          <div className="space-y-2">
            {[
              { k: 'Uptime',         v: data?.uptime ?? '—' },
              { k: 'Last health req', v: data?.timestamp ? new Date(data.timestamp).toLocaleString() : '—' },
              { k: 'Correlation ID', v: data?.correlationId ?? '—' },
              { k: 'Overall status', v: data?.status ?? '—' },
            ].map(({ k, v }) => (
              <div key={k} className="flex justify-between items-center text-sm border-b border-surface-border pb-2 last:border-0 last:pb-0">
                <span className="text-slate-500">{k}</span>
                <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{v}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Raw JSON */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">GET /api/health</div>
            <Badge color="green">200 OK</Badge>
          </div>
          {isLoading
            ? <Skeleton className="h-32 w-full" />
            : <pre className="font-mono text-[11px] text-slate-600 bg-slate-50 rounded-xl p-4 overflow-auto max-h-48 leading-relaxed">
                {JSON.stringify(data, null, 2)}
              </pre>
          }
        </Card>
      </div>

      {/* RBAC Role Hierarchy */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-brand-700" />
          <div className="text-sm font-bold text-slate-700">RBAC Role Hierarchy</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {ROLES.map(r => (
            <div key={r.role} className="border border-surface-border rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">{r.icon}</div>
              <div className="text-xs font-bold text-slate-700 mb-0.5">{r.label}</div>
              <div className="text-[10px] text-slate-400 mb-2">Level {r.level}</div>
              <Badge color={
                r.level === 5 ? 'red' : r.level === 4 ? 'purple' :
                r.level === 3 ? 'amber' : r.level === 2 ? 'blue' : 'green'
              }>
                L{r.level}
              </Badge>
              <div className="text-[10px] text-slate-400 mt-2 leading-tight">{r.perms}</div>
            </div>
          ))}
        </div>

        {/* Middleware logic note */}
        <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-surface-border">
          <div className="text-xs font-bold text-slate-600 mb-2">Middleware Logic (rbac.ts)</div>
          <pre className="font-mono text-[11px] text-slate-500 leading-relaxed">{`// requireRole('HOD') will block COORDINATOR and PROFESSOR
if (HIERARCHY[req.user.role] < HIERARCHY[minimumRole]) {
  return res.status(403).json({ error: 'Forbidden',
    message: \`Requires \${minimumRole}+. Your role: \${req.user.role}\` });
}`}</pre>
        </div>
      </Card>
    </div>
  );
}
