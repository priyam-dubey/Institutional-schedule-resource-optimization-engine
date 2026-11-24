import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { useCan } from '../../lib/authStore';
import { ALL_DAYS, dayShort, errMsg, useApiMutation, useSemesters, type Day, type Period, type Semester } from '../../lib/scheduling';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Skeleton } from '../ui';

interface Institution { id: number; name: string; code: string; timezone: string; address: string | null; _count?: { departments: number; academicYears: number } }
interface Year { id: number; institutionId: number; label: string; startDate: string; endDate: string; isCurrent: boolean; semesters: Semester[] }

const d10 = (s: string) => s.slice(0, 10);
const DEFAULT_PERIODS: Period[] = [
  { index: 0, label: 'I', startTime: '09:00', endTime: '09:50', isBreak: false },
  { index: 1, label: 'II', startTime: '09:50', endTime: '10:40', isBreak: false },
  { index: 2, label: 'III', startTime: '10:40', endTime: '11:30', isBreak: false },
  { index: 3, label: 'Break', startTime: '11:30', endTime: '12:00', isBreak: true },
  { index: 4, label: 'IV', startTime: '12:00', endTime: '12:50', isBreak: false },
  { index: 5, label: 'V', startTime: '12:50', endTime: '13:40', isBreak: false },
];

export default function SetupPage() {
  const canEdit = useCan('ADMIN');
  return (
    <div className="space-y-6">
      <PageHeader title="Institution & Academic Calendar" subtitle="Institution, academic years, semesters, working days and the period grid used by the timetable engine" />
      {!canEdit && <p className="text-xs text-slate-500 bg-slate-50 border border-surface-border rounded-xl px-4 py-2">Read-only: only administrators can change the institution and calendar.</p>}
      <InstitutionSection canEdit={canEdit} />
      <YearsSection canEdit={canEdit} />
      <PeriodsSection canEdit={canEdit} />
    </div>
  );
}

function InstitutionSection({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useQuery<Institution[]>({ queryKey: ['institutions'], queryFn: () => api.get('/institutions').then((r) => r.data.items) });
  const [f, setF] = useState({ name: '', code: '', timezone: 'Asia/Kolkata' });
  const create = useApiMutation(() => api.post('/institutions', f), { invalidate: [['institutions']], success: 'Institution created', onSuccess: () => setF({ name: '', code: '', timezone: 'Asia/Kolkata' }) });
  return (
    <Card>
      <h2 className="text-sm font-bold text-slate-800 mb-3">Institution</h2>
      {isLoading ? <Skeleton className="h-10" /> : data?.length ? (
        <ul className="divide-y divide-surface-border mb-3">
          {data.map((i) => (
            <li key={i.id} className="py-2 flex items-center justify-between text-sm">
              <span><b>{i.name}</b> <span className="text-slate-400">({i.code})</span></span>
              <span className="text-xs text-slate-500">{i._count?.departments ?? 0} departments · {i._count?.academicYears ?? 0} academic years · {i.timezone}</span>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon="🏫" title="No institution yet" subtitle="Create one to start the setup." />}
      {canEdit && (
        <form className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined as never); }}>
          <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} />
          <Input label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required minLength={2} />
          <Input label="Timezone" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} />
          <Button type="submit" icon={<Plus className="w-4 h-4" />} loading={create.isPending}>Add institution</Button>
        </form>
      )}
    </Card>
  );
}

function YearsSection({ canEdit }: { canEdit: boolean }) {
  const { data: insts = [] } = useQuery<Institution[]>({ queryKey: ['institutions'], queryFn: () => api.get('/institutions').then((r) => r.data.items) });
  const { data: years = [], isLoading } = useQuery<Year[]>({ queryKey: ['years'], queryFn: () => api.get('/academic-years').then((r) => r.data.items) });
  const [y, setY] = useState({ institutionId: '', label: '', startDate: '', endDate: '' });
  const [s, setS] = useState<{ yearId: string; name: string; startDate: string; endDate: string; days: Day[] }>({ yearId: '', name: '', startDate: '', endDate: '', days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] });
  const inv = [['years'], ['semesters']];
  const addYear = useApiMutation(() => api.post('/academic-years', { institutionId: Number(y.institutionId || insts[0]?.id), label: y.label, startDate: y.startDate, endDate: y.endDate, isCurrent: years.length === 0 }), { invalidate: inv, success: 'Academic year created' });
  const addSem = useApiMutation(() => api.post('/semesters', { academicYearId: Number(s.yearId || years[0]?.id), name: s.name, startDate: s.startDate, endDate: s.endDate, workingDays: s.days }), { invalidate: inv, success: 'Semester created' });
  const delSem = useApiMutation((id: number) => api.delete(`/semesters/${id}`), { invalidate: inv, success: 'Semester deleted' });
  const delYear = useApiMutation((id: number) => api.delete(`/academic-years/${id}`), { invalidate: inv, success: 'Academic year deleted' });
  const setCurrent = useApiMutation((id: number) => api.patch(`/academic-years/${id}`, { isCurrent: true }), { invalidate: inv, success: 'Current year updated' });

  return (
    <Card>
      <h2 className="text-sm font-bold text-slate-800 mb-3">Academic years & semesters</h2>
      {isLoading ? <Skeleton className="h-16" /> : years.length === 0 ? <EmptyState icon="📅" title="No academic years" subtitle="Add the first academic year below." /> : (
        <div className="space-y-3 mb-4">
          {years.map((yr) => (
            <div key={yr.id} className="border border-surface-border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{yr.label} <span className="text-xs text-slate-400 font-normal">{d10(yr.startDate)} → {d10(yr.endDate)}</span> {yr.isCurrent && <Badge color="green">current</Badge>}</div>
                {canEdit && (
                  <div className="flex gap-2">
                    {!yr.isCurrent && <Button size="sm" variant="secondary" onClick={() => setCurrent.mutate(yr.id)}>Make current</Button>}
                    <Button size="sm" variant="ghost" aria-label={`Delete year ${yr.label}`} onClick={() => delYear.mutate(yr.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {yr.semesters.length === 0 && <li className="text-xs text-slate-400">No semesters yet</li>}
                {yr.semesters.map((sem) => (
                  <li key={sem.id} className="flex items-center justify-between text-sm">
                    <span>{sem.name} <span className="text-xs text-slate-400">{d10(sem.startDate)} → {d10(sem.endDate)} · {sem.workingDays.map(dayShort).join(' ')}</span></span>
                    {canEdit && <Button size="sm" variant="ghost" aria-label={`Delete semester ${sem.name}`} onClick={() => delSem.mutate(sem.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="grid md:grid-cols-2 gap-6">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); addYear.mutate(undefined as never); }}>
            <h3 className="text-xs font-bold text-slate-500 uppercase">New academic year</h3>
            <Select label="Institution" value={y.institutionId} onChange={(e) => setY({ ...y, institutionId: e.target.value })} options={insts.map((i) => ({ value: i.id, label: i.name }))} placeholder="Select institution" required />
            <Input label="Label (e.g. 2026-27)" value={y.label} onChange={(e) => setY({ ...y, label: e.target.value })} required minLength={4} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start date" type="date" value={y.startDate} onChange={(e) => setY({ ...y, startDate: e.target.value })} required />
              <Input label="End date" type="date" value={y.endDate} onChange={(e) => setY({ ...y, endDate: e.target.value })} required />
            </div>
            <Button type="submit" icon={<Plus className="w-4 h-4" />} loading={addYear.isPending}>Add year</Button>
          </form>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); addSem.mutate(undefined as never); }}>
            <h3 className="text-xs font-bold text-slate-500 uppercase">New semester</h3>
            <Select label="Academic year" value={s.yearId} onChange={(e) => setS({ ...s, yearId: e.target.value })} options={years.map((v) => ({ value: v.id, label: v.label }))} placeholder="Select year" required />
            <Input label="Name (e.g. Odd Semester)" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start date" type="date" value={s.startDate} onChange={(e) => setS({ ...s, startDate: e.target.value })} required />
              <Input label="End date" type="date" value={s.endDate} onChange={(e) => setS({ ...s, endDate: e.target.value })} required />
            </div>
            <fieldset>
              <legend className="text-xs font-semibold text-slate-600 mb-1.5">Working days</legend>
              <div className="flex flex-wrap gap-2">
                {ALL_DAYS.map((d) => (
                  <label key={d} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={s.days.includes(d)} onChange={(e) => setS({ ...s, days: e.target.checked ? [...s.days, d] : s.days.filter((x) => x !== d) })} />
                    {dayShort(d)}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" icon={<Plus className="w-4 h-4" />} loading={addSem.isPending} disabled={s.days.length === 0}>Add semester</Button>
          </form>
        </div>
      )}
    </Card>
  );
}

function PeriodsSection({ canEdit }: { canEdit: boolean }) {
  const { data: semesters = [] } = useSemesters();
  const [semId, setSemId] = useState('');
  const id = Number(semId || semesters[0]?.id || 0);
  const { data: detail } = useQuery<Semester>({ queryKey: ['semester', id], enabled: !!id, queryFn: () => api.get(`/semesters/${id}`).then((r) => r.data) });
  const [draft, setDraft] = useState<Period[] | null>(null);
  const rows = draft ?? (detail?.periods?.length ? detail.periods : []);
  const [hol, setHol] = useState({ date: '', name: '' });
  const save = useApiMutation(() => api.put(`/semesters/${id}/periods`, { periods: rows.map(({ label, startTime, endTime, isBreak }) => ({ label, startTime, endTime, isBreak })) }), { invalidate: [['semester', id], ['semesters']], success: 'Period grid saved', onSuccess: () => setDraft(null) });
  const addHol = useApiMutation(() => api.post(`/semesters/${id}/holidays`, hol), { invalidate: [['semester', id]], success: 'Holiday added', onSuccess: () => setHol({ date: '', name: '' }) });
  const delHol = useApiMutation((hid: number) => api.delete(`/semesters/${id}/holidays/${hid}`), { invalidate: [['semester', id]] });
  const set = (i: number, patch: Partial<Period>) => setDraft(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <Card>
      <div className="flex items-end justify-between gap-4 mb-3">
        <h2 className="text-sm font-bold text-slate-800">Period grid & holidays</h2>
        <div className="w-64"><Select value={String(id || '')} onChange={(e) => { setSemId(e.target.value); setDraft(null); }} options={semesters.map((s) => ({ value: s.id, label: `${s.academicYear?.label ?? ''} · ${s.name}` }))} placeholder="Select semester" aria-label="Semester" /></div>
      </div>
      {!id ? <EmptyState icon="🕘" title="Create a semester first" /> : (
        <>
          {rows.length === 0 && <p className="text-xs text-amber-600 mb-2">This semester has no periods. The timetable engine needs at least one teaching period.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-500 text-left"><th className="py-1 pr-2">#</th><th>Label</th><th>Start</th><th>End</th><th>Break</th><th /></tr></thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2 text-slate-400">{i}</td>
                    <td><input className="input !py-1" aria-label={`Label ${i}`} value={p.label} disabled={!canEdit} onChange={(e) => set(i, { label: e.target.value })} /></td>
                    <td><input className="input !py-1" type="time" aria-label={`Start ${i}`} value={p.startTime} disabled={!canEdit} onChange={(e) => set(i, { startTime: e.target.value })} /></td>
                    <td><input className="input !py-1" type="time" aria-label={`End ${i}`} value={p.endTime} disabled={!canEdit} onChange={(e) => set(i, { endTime: e.target.value })} /></td>
                    <td className="text-center"><input type="checkbox" aria-label={`Break ${i}`} checked={p.isBreak} disabled={!canEdit} onChange={(e) => set(i, { isBreak: e.target.checked })} /></td>
                    <td>{canEdit && <Button size="sm" variant="ghost" aria-label={`Remove period ${i}`} onClick={() => setDraft(rows.filter((_, k) => k !== i).map((r, k) => ({ ...r, index: k })))}><Trash2 className="w-3.5 h-3.5" /></Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex gap-2 mt-3">
              <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setDraft([...rows, { index: rows.length, label: `P${rows.length + 1}`, startTime: rows[rows.length - 1]?.endTime ?? '09:00', endTime: rows[rows.length - 1]?.endTime ?? '09:50', isBreak: false }])}>Add period</Button>
              <Button variant="secondary" size="sm" onClick={() => setDraft(DEFAULT_PERIODS)}>Use default grid</Button>
              <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} loading={save.isPending} disabled={!draft || rows.length === 0} onClick={() => save.mutate(undefined as never)}>Save grid</Button>
            </div>
          )}
          {save.isError && <p className="text-xs text-red-500 mt-2">{errMsg(save.error)}</p>}
          <h3 className="text-xs font-bold text-slate-500 uppercase mt-6 mb-2">Holidays</h3>
          <ul className="text-sm space-y-1 mb-3">
            {(detail?.holidays ?? []).length === 0 && <li className="text-xs text-slate-400">No holidays recorded</li>}
            {detail?.holidays?.map((h) => (
              <li key={h.id} className="flex items-center justify-between">{d10(h.date)} — {h.name}{canEdit && <Button size="sm" variant="ghost" aria-label={`Delete holiday ${h.name}`} onClick={() => delHol.mutate(h.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}</li>
            ))}
          </ul>
          {canEdit && (
            <form className="flex gap-3 items-end" onSubmit={(e) => { e.preventDefault(); addHol.mutate(undefined as never); }}>
              <Input label="Date" type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} required />
              <Input label="Name" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} required />
              <Button type="submit" variant="secondary" loading={addHol.isPending}>Add</Button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
