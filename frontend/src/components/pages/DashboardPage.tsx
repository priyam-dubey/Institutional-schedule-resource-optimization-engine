import { useAnalytics } from '../../hooks/useAnalytics';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  Building2, DoorOpen, BookOpen, Users,
  TrendingUp, Clock, AlertTriangle, Activity
} from 'lucide-react';
import {
  Card, StatCard, PageHeader, Badge, Skeleton, TableSkeleton,
  ProgressBar, EmptyState
} from '../ui';

// ─── Colour helpers ───────────────────────────────────────────────────────────
function utilColour(u: number) {
  if (u > 85) return '#ef4444';
  if (u > 70) return '#f59e0b';
  return '#10b981';
}

// ─── Shimmer skeleton for metrics ─────────────────────────────────────────────
function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-surface-border p-5">
          <Skeleton className="h-3 w-24 mb-3" />
          <Skeleton className="h-7 w-16 mb-2" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error, dataUpdatedAt } = useAnalytics();

  if (error) return (
    <EmptyState icon="⚠️" title="Analytics unavailable"
      subtitle="Could not load dashboard metrics. Check that the API and DB are healthy." />
  );

  const s = data?.summary;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  return (
    <div>
      <PageHeader
        title="Live Analytics Dashboard"
        subtitle={data ? 'Last computed: ' + new Date(data.computedAt).toLocaleTimeString() : 'Loading…'}
        actions={
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
            <Activity className="w-3.5 h-3.5" />
            Auto-refreshes via WebSocket
          </div>
        }
      />

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      {isLoading ? <MetricsSkeleton /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Avg Room Utilisation"
            value={s ? s.avgUtilization + '%' : '—'}
            sub="Dept-wide average"
            icon={<TrendingUp className="w-4 h-4" />}
            accentClass="bg-brand-gradient"
          />
          <StatCard label="Occupied Slots / Week"
            value={s ? s.occupiedSlots : '—'}
            sub={'of ' + (s?.totalAvailableSlots ?? '—') + ' available'}
            icon={<DoorOpen className="w-4 h-4" />}
            accentClass="bg-gradient-to-r from-emerald-400 to-teal-400"
          />
          <StatCard label="Under-Running Courses"
            value={data?.underRunningCourses.length ?? '—'}
            sub="Need scheduling attention"
            icon={<AlertTriangle className="w-4 h-4" />}
            accentClass="bg-gradient-to-r from-amber-400 to-orange-400"
          />
          <StatCard label="Avg Empty Room-Hours/Day"
            value={s ? s.avgEmptyRoomHoursPerDay + 'h' : '—'}
            sub="mean(unscheduled × 50/60)"
            icon={<Clock className="w-4 h-4" />}
            accentClass="bg-gradient-to-r from-blue-400 to-indigo-400"
          />
        </div>
      )}

      {/* ── Charts row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* Utilisation bar chart */}
        <Card className="lg:col-span-3" noPadding>
          <div className="px-5 pt-5 pb-3 border-b border-surface-border">
            <div className="text-sm font-bold text-slate-700">Room Utilisation</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Util(r) = (slots_occupied / total_available) × 100
            </div>
          </div>
          <div className="p-5">
            {isLoading ? <Skeleton className="h-52 w-full" /> : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={data?.roomStats ?? []} barSize={20}
                  margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="roomNumber" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" domain={[0, 100]} />
                  <Tooltip
                    formatter={(v: number) => [v + '%', 'Utilisation']}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="utilization" radius={[5, 5, 0, 0]}>
                    {(data?.roomStats ?? []).map((r, i) => (
                      <Cell key={i} fill={utilColour(r.utilization)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* P(empty | S) line chart */}
        <Card className="lg:col-span-2" noPadding>
          <div className="px-5 pt-5 pb-3 border-b border-surface-border">
            <div className="text-sm font-bold text-slate-700">P(empty | slot S)</div>
            <div className="text-xs text-slate-400 mt-0.5">
              free_rooms_in_S / total_rooms
            </div>
          </div>
          <div className="p-5">
            {isLoading ? <Skeleton className="h-52 w-full" /> : (() => {
              const chartData = Object.entries(data?.periodEmptyProbability ?? {}).map(([k, v]) => ({ period: k, prob: v }));
              return (
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 1]} tickFormatter={v => v.toFixed(1)} />
                    <Tooltip
                      formatter={(v: number) => [v.toFixed(3), 'P(empty)']}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                    />
                    <Line dataKey="prob" stroke="#3DA1FF" strokeWidth={2} dot={{ r: 4, fill: '#256199' }} activeDot={{ r: 6 }} type="monotone" />
                  </LineChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </Card>
      </div>

      {/* ── Bottom row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Room details table */}
        <Card noPadding>
          <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
            <div className="text-sm font-bold text-slate-700">Room Details</div>
            <Badge color="blue">Per Room</Badge>
          </div>
          {isLoading ? <div className="p-4"><TableSkeleton rows={5} cols={4} /></div> : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Room</th><th>Dept</th><th>Utilisation</th><th>Capacity</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.roomStats ?? []).map(r => (
                    <tr key={r.roomId}>
                      <td className="font-semibold">{r.roomNumber}</td>
                      <td><Badge color="blue">{r.department}</Badge></td>
                      <td>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <ProgressBar value={r.utilization} showLabel />
                        </div>
                      </td>
                      <td className="text-slate-500 text-xs">
                        {r.capacity != null ? r.capacity + ' seats' : (
                          <Badge color="amber">Missing</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Under-running courses */}
        <Card noPadding>
          <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
            <div className="text-sm font-bold text-slate-700">⚠️ Under-Running Courses</div>
            <Badge color="amber">scheduled &lt; required</Badge>
          </div>
          {isLoading ? <div className="p-4"><Skeleton className="h-48 w-full" /></div>
            : (data?.underRunningCourses.length ?? 0) === 0
            ? <EmptyState icon="✅" title="All courses on track" subtitle="No under-running courses detected." />
            : (
              <div className="divide-y divide-surface-border">
                {data!.underRunningCourses.map(c => (
                  <div key={c.courseId} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-700 truncate">{c.code} — {c.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {c.scheduled} scheduled · {c.required} required · {c.credits} credits
                      </div>
                    </div>
                    <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg flex-shrink-0">
                      −{c.deficit} slot{c.deficit !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )
          }

          {/* Formula panel */}
          <div className="p-4 grid grid-cols-2 gap-3 border-t border-surface-border bg-slate-50/50">
            {[
              { title: 'Utilisation', formula: 'occupied / available × 100' },
              { title: 'P(empty | S)', formula: 'free_rooms_S / total_rooms' },
              { title: 'Under-Running', formula: 'scheduled < ⌈credits × 2⌉' },
              { title: 'Avg Empty Hrs/Day', formula: 'mean(unscheduled × 50/60)' },
            ].map(f => (
              <div key={f.title} className="bg-white border border-surface-border rounded-xl p-3">
                <div className="text-[11px] font-bold text-slate-500 mb-1">{f.title}</div>
                <div className="font-mono text-[10px] text-brand-700 bg-brand-50 px-2 py-1 rounded-lg leading-tight">{f.formula}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
