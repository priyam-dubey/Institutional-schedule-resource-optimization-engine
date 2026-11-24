import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Activity, CalendarClock, DoorOpen, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useCurrentSemester, useScheduleLiveUpdates } from '../../lib/scheduling';
import SemesterPicker from '../common/SemesterPicker';
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, Skeleton, StatCard } from '../ui';

export interface ScheduleAnalytics {
  scope: { semesterId: number; generationIds: number[]; published: boolean; slotsPerWeek: number };
  summary: { sections: number; requiredSessions: number; scheduledSessions: number; completion: number; unassignedSessions: number; roomUtilization: number; facultyUtilization: number; idleRooms: number; totalRooms: number; overloadedFaculty: number; totalFaculty: number; unusedRoomPeriods: number };
  rooms: { roomId: number; roomNumber: string; type: string; usedPeriods: number; availablePeriods: number; utilization: number }[];
  faculty: { facultyProfileId: number; name: string; periods: number; maxPeriodsPerWeek: number; loadPercent: number; teachingDays: number; overloaded: boolean }[];
  departments: { department: string; sections: number; required: number; scheduled: number; completion: number }[];
  sections: { sectionId: number; name: string; requiredSessions: number; scheduledSessions: number; completion: number }[];
  unassigned: { requirementId: number; sectionId: number; subject: string; batch: string | null; missingSessions: number }[];
  heatmap: { day: string; period: string; position: number; classes: number }[];
}

const col = (u: number) => (u > 85 ? '#ef4444' : u > 70 ? '#f59e0b' : '#10b981');

export default function ScheduleDashboardPage() {
  useScheduleLiveUpdates();
  const { current, isLoading: semLoading } = useCurrentSemester();
  const { data, isLoading, error } = useQuery<ScheduleAnalytics>({
    queryKey: ['schedule-analytics', current?.id], enabled: !!current, refetchInterval: 60_000,
    queryFn: () => api.get('/analytics/schedule', { params: { semesterId: current!.id } }).then((r) => r.data),
  });

  const header = <PageHeader title="Scheduling Dashboard" subtitle="Computed from the stored timetable — published generations when available, otherwise the newest completed draft" actions={<SemesterPicker />} />;
  if (semLoading) return <div>{header}<Skeleton className="h-40" /></div>;
  if (!current) return <div>{header}<EmptyState icon="🚀" title="Welcome to Samayak" subtitle="Start with Institution & Calendar to create an academic year and semester." action={<Link to="/setup"><Button>Open setup</Button></Link>} /></div>;
  if (error) return <div>{header}<EmptyState icon="🗓️" title="No timetable data for this semester yet" subtitle="Check the period grid is configured, then generate a timetable." action={<Link to="/generate"><Button>Generate</Button></Link>} /></div>;
  if (isLoading || !data) return <div>{header}<Skeleton className="h-40" /></div>;
  if (data.scope.generationIds.length === 0) return <div>{header}<EmptyState icon="🧮" title="No timetable generated yet" subtitle="Generate a timetable to see utilisation and completion." action={<Link to="/generate"><Button>Generate</Button></Link>} /></div>;

  const s = data.summary;
  const periods = [...new Set(data.heatmap.map((h) => h.period))];
  const days = [...new Set(data.heatmap.map((h) => h.day))];
  const max = Math.max(1, ...data.heatmap.map((h) => h.classes));
  return (
    <div className="space-y-6">
      {header}
      <div className="flex items-center gap-2 text-xs">{data.scope.published ? <Badge color="green" dot>Published timetable</Badge> : <Badge color="amber" dot>Draft (not published)</Badge>}<span className="text-slate-400">{data.scope.generationIds.length} generation(s)</span></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sessions scheduled" value={`${s.scheduledSessions}/${s.requiredSessions}`} sub={`${s.completion}% complete · ${s.sections} section(s)`} icon={<CalendarClock className="w-4 h-4" />} />
        <StatCard label="Room utilisation" value={`${s.roomUtilization}%`} sub={`${s.idleRooms} of ${s.totalRooms} rooms idle`} icon={<DoorOpen className="w-4 h-4" />} />
        <StatCard label="Faculty load" value={`${s.facultyUtilization}%`} sub={`${s.overloadedFaculty} overloaded of ${s.totalFaculty}`} icon={<Users className="w-4 h-4" />} />
        <StatCard label="Unassigned sessions" value={s.unassignedSessions} sub={s.unassignedSessions ? 'needs attention' : 'all scheduled'} icon={s.unassignedSessions ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card><h2 className="text-sm font-bold mb-3">Room utilisation</h2>
          {data.rooms.length === 0 ? <p className="text-sm text-slate-400">No rooms.</p> : (
            <div style={{ height: Math.max(160, data.rooms.length * 28) }}><ResponsiveContainer><BarChart data={data.rooms} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} unit="%" /><YAxis type="category" dataKey="roomNumber" width={60} /><Tooltip formatter={(v: number) => `${v}%`} /><Bar dataKey="utilization" radius={[0, 6, 6, 0]}>{data.rooms.map((r) => <Cell key={r.roomId} fill={col(r.utilization)} />)}</Bar></BarChart></ResponsiveContainer></div>)}
        </Card>
        <Card><h2 className="text-sm font-bold mb-3">Faculty workload</h2>
          <ul className="space-y-2 max-h-80 overflow-y-auto">{data.faculty.map((f) => (
            <li key={f.facultyProfileId} className="text-sm"><div className="flex justify-between"><span>{f.name}</span><span className={f.overloaded ? 'text-red-600 font-semibold' : 'text-slate-500'}>{f.periods}/{f.maxPeriodsPerWeek} periods · {f.teachingDays}d</span></div><ProgressBar value={Math.min(100, f.loadPercent)} color={col(f.loadPercent)} /></li>))}</ul>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card><h2 className="text-sm font-bold mb-3">Departments & sections</h2>
          <ul className="space-y-2 mb-4">{data.departments.map((d) => <li key={d.department} className="text-sm"><div className="flex justify-between"><b>{d.department}</b><span className="text-slate-500">{d.scheduled}/{d.required} sessions · {d.sections} sections</span></div><ProgressBar value={d.completion} /></li>)}</ul>
          <ul className="space-y-1.5">{data.sections.map((x) => <li key={x.sectionId} className="flex justify-between text-xs"><span>{x.name}</span><span className={x.completion < 100 ? 'text-amber-600' : 'text-emerald-600'}>{x.scheduledSessions}/{x.requiredSessions} ({x.completion}%)</span></li>)}</ul>
        </Card>
        <Card><h2 className="text-sm font-bold mb-3">Busiest slots (classes running at once)</h2>
          <div className="overflow-x-auto"><table className="text-xs" aria-label="Slot heatmap"><thead><tr><th />{periods.map((p) => <th key={p} className="px-2 text-slate-500">{p}</th>)}</tr></thead>
            <tbody>{days.map((d) => <tr key={d}><th className="text-left pr-2 text-slate-500">{d.slice(0, 3)}</th>{periods.map((p) => { const c = data.heatmap.find((h) => h.day === d && h.period === p)?.classes ?? 0; return <td key={p} className="p-0.5"><div title={`${c} classes`} className="w-10 h-8 rounded-md flex items-center justify-center font-semibold text-white" style={{ background: c === 0 ? '#e2e8f0' : `rgba(79,70,229,${0.25 + 0.75 * (c / max)})`, color: c === 0 ? '#94a3b8' : '#fff' }}>{c}</div></td>; })}</tr>)}</tbody></table></div>
        </Card>
      </div>

      {data.unassigned.length > 0 && (
        <Card><h2 className="text-sm font-bold mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-amber-500" />Unassigned lectures</h2>
          <ul className="text-sm space-y-1">{data.unassigned.map((u) => <li key={u.requirementId}>{u.subject}{u.batch ? ` (${u.batch})` : ''} — <b>{u.missingSessions}</b> session(s) missing</li>)}</ul></Card>)}
    </div>
  );
}
