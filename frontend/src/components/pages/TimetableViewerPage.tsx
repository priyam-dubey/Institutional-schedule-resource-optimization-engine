import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, EyeOff, Rocket, ShieldCheck, Archive } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { useCan } from '../../lib/authStore';
import {
  dayShort, errData, errMsg, useApiMutation, useFacultyProfiles, useGeneration, useTimetable, statusColor,
  type Conflict, type Entry, type TimetableView, type ValidationReport,
} from '../../lib/scheduling';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, PageHeader, Select, Skeleton } from '../ui';

type Mode = 'section' | 'faculty' | 'room';

export default function TimetableViewerPage() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const canEdit = useCan('HOD');
  const canPublish = useCan('DEAN');
  const { data: gen, isLoading } = useGeneration(gid);
  const { data: tt } = useTimetable(gid);
  const [mode, setMode] = useState<Mode>('section');
  const [subject, setSubject] = useState('');
  const [editing, setEditing] = useState<Entry | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [publishAsk, setPublishAsk] = useState<null | { kind: 'INCOMPLETE' | 'SECTION_OVERLAP'; message: string }>(null);
  const [publishErr, setPublishErr] = useState<ValidationReport | null>(null);
  const inv = [['generation', gid], ['timetable', gid], ['generations'], ['conflicts', gid], ['schedule-analytics']];
  const conflicts = useQuery<Conflict[]>({ queryKey: ['conflicts', gid], enabled: !!gid, queryFn: () => api.get(`/generations/${gid}/conflicts`).then((r) => r.data.items) });

  const publish = useApiMutation((o: { allowPartial?: boolean; replace?: boolean }) => api.post(`/generations/${gid}/publish`, o), { invalidate: inv, success: 'Timetable published' });
  const doPublish = (o: { allowPartial?: boolean; replace?: boolean } = {}) => publish.mutate(o, {
    onError: (e) => {
      const r = errData(e); const code = r?.data?.code;
      if (r && (code === 'INCOMPLETE' || code === 'SECTION_OVERLAP')) setPublishAsk({ kind: code, message: r.data.error });
      else if (r && code === 'VALIDATION_FAILED') setPublishErr(r.data.details);
    },
    onSuccess: () => { setPublishAsk(null); setPublishErr(null); },
  });
  const unpublish = useApiMutation(() => api.post(`/generations/${gid}/unpublish`), { invalidate: inv, success: 'Timetable unpublished' });
  const archive = useApiMutation(() => api.post(`/generations/${gid}/archive`), { invalidate: inv, success: 'Archived' });
  const clone = useApiMutation(() => api.post(`/generations/${gid}/clone`).then((r) => r.data), { invalidate: inv, success: 'New draft version created', onSuccess: (g: { id: number }) => nav(`/timetables/${g.id}`) });
  const validate = useApiMutation(() => api.get(`/generations/${gid}/validate`).then((r) => r.data as ValidationReport), { onSuccess: (r) => { setReport(r); toast[r.valid ? 'success' : 'error'](r.valid ? 'No hard-constraint violations' : `${r.totalViolations} violation(s)`); } });

  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    tt?.entries.forEach((e) => {
      if (mode === 'section') m.set(String(e.sectionId), e.section);
      else if (mode === 'faculty') m.set(String(e.facultyProfileId), e.facultyName);
      else m.set(String(e.roomId), e.roomNumber);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  }, [tt, mode]);
  const subjectId = subject && subjects.some((s) => s.value === subject) ? subject : subjects[0]?.value;

  if (isLoading) return <Skeleton className="h-64" />;
  if (!gen) return <EmptyState icon="🔎" title="Generation not found" action={<Link to="/generate"><Button>Back</Button></Link>} />;
  const published = gen.publishStatus === 'PUBLISHED';
  const readOnly = published || gen.publishStatus === 'ARCHIVED' || !canEdit;
  const visible = (tt?.entries ?? []).filter((e) => (mode === 'section' ? e.sectionId : mode === 'faculty' ? e.facultyProfileId : e.roomId) === Number(subjectId));

  return (
    <div className="space-y-6">
      <PageHeader title={`Timetable v${gen.version}${gen.name ? ` · ${gen.name}` : ''}`} subtitle={`${gen.assignedSessions ?? 0}/${gen.totalSessions ?? 0} sessions scheduled`}
        actions={<div className="flex gap-2 flex-wrap">
          <Badge color={statusColor(gen.publishStatus)}>{gen.publishStatus}</Badge>{gen.solveStatus && <Badge color={statusColor(gen.solveStatus)}>{gen.solveStatus}</Badge>}
          <Button size="sm" variant="secondary" icon={<ShieldCheck className="w-3.5 h-3.5" />} loading={validate.isPending} onClick={() => validate.mutate(undefined as never)}>Validate</Button>
          {canEdit && <Button size="sm" variant="secondary" icon={<Copy className="w-3.5 h-3.5" />} loading={clone.isPending} onClick={() => clone.mutate(undefined as never)}>Clone as new version</Button>}
          {canPublish && !published && gen.publishStatus === 'DRAFT' && <Button size="sm" icon={<Rocket className="w-3.5 h-3.5" />} loading={publish.isPending} onClick={() => doPublish()}>Publish</Button>}
          {canPublish && published && <Button size="sm" variant="secondary" icon={<EyeOff className="w-3.5 h-3.5" />} loading={unpublish.isPending} onClick={() => unpublish.mutate(undefined as never)}>Unpublish</Button>}
          {canEdit && !published && gen.publishStatus === 'DRAFT' && <Button size="sm" variant="ghost" icon={<Archive className="w-3.5 h-3.5" />} onClick={() => archive.mutate(undefined as never)}>Archive</Button>}
        </div>} />
      {published && <p className="text-xs bg-emerald-50 text-emerald-700 rounded-xl px-4 py-2">Published timetables are read-only. Clone it into a new draft version to make changes.</p>}
      {(gen.stats?.warnings?.length ?? 0) > 0 && <div className="text-xs bg-amber-50 text-amber-800 rounded-xl px-4 py-2">{gen.stats!.warnings!.map((w) => <div key={w}>⚠ {w}</div>)}</div>}

      <Card>
        <div className="flex gap-3 items-end mb-4 flex-wrap">
          <div className="flex gap-1" role="tablist">{(['section', 'faculty', 'room'] as Mode[]).map((m) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setSubject(''); }} className={`px-3 py-1.5 rounded-xl text-sm font-semibold capitalize ${mode === m ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'}`}>{m}</button>)}</div>
          <div className="w-64"><Select aria-label={`Select ${mode}`} value={subjectId ?? ''} onChange={(e) => setSubject(e.target.value)} options={subjects} /></div>
        </div>
        {!tt ? <Skeleton className="h-48" /> : tt.entries.length === 0 ? <EmptyState icon="🗓️" title="This timetable has no entries" /> : <Grid tt={tt} entries={visible} mode={mode} onPick={(e) => !readOnly && setEditing(e)} readOnly={readOnly} />}
      </Card>

      <ConflictPanel conflicts={conflicts.data ?? []} report={report} />
      {editing && tt && <EditModal gid={gid} entry={editing} tt={tt} onClose={() => setEditing(null)} onDeleted={() => { setEditing(null); inv.forEach((k) => void k); }} invalidate={inv} />}

      <ConfirmDialog open={!!publishAsk} onClose={() => setPublishAsk(null)} loading={publish.isPending} title={publishAsk?.kind === 'INCOMPLETE' ? 'Publish an incomplete timetable?' : 'Replace the published timetable?'}
        message={publishAsk?.message ?? ''} confirmLabel={publishAsk?.kind === 'INCOMPLETE' ? 'Publish anyway' : 'Archive old & publish'}
        onConfirm={() => doPublish(publishAsk?.kind === 'INCOMPLETE' ? { allowPartial: true } : { replace: true })} />
      <Modal open={!!publishErr} onClose={() => setPublishErr(null)} title="Cannot publish: hard-constraint violations" size="lg">
        <ul className="text-sm space-y-1 max-h-72 overflow-y-auto">{publishErr?.violations.map((v, i) => <li key={i}><Badge color="red">{v.type}</Badge> {v.message}</li>)}</ul>
      </Modal>
    </div>
  );
}

function Grid({ tt, entries, mode, onPick, readOnly }: { tt: TimetableView; entries: Entry[]; mode: Mode; onPick: (e: Entry) => void; readOnly: boolean }) {
  const cell = (day: string, pos: number) => entries.filter((e) => e.day === day && pos >= e.startPeriod && pos < e.startPeriod + e.length);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs" aria-label="Timetable grid">
        <thead><tr><th className="w-14" />{tt.periods.map((p) => <th key={p.position} className="px-1 py-2 text-slate-500 font-semibold">{p.label}<span className="block font-normal text-[10px] text-slate-400">{p.startTime}</span></th>)}</tr></thead>
        <tbody>{tt.days.map((d) => (
          <tr key={d}><th className="text-left text-slate-500 pr-2">{dayShort(d)}</th>
            {tt.periods.map((p) => {
              if (p.isBreak) return <td key={p.position} className="bg-slate-100 text-center text-[10px] text-slate-400 w-10">break</td>;
              const items = cell(d, p.position);
              return (
                <td key={p.position} className="border border-surface-border align-top min-w-[110px] h-16 p-1" data-cell={`${d}|${p.position}`}>
                  {items.map((e) => (
                    <button key={e.id} type="button" disabled={readOnly} onClick={() => onPick(e)} title={`${e.subjectName}`}
                      className={`block w-full text-left rounded-lg px-1.5 py-1 mb-0.5 leading-tight ${e.subjectType === 'LAB' ? 'bg-purple-50 text-purple-800' : 'bg-brand-50 text-brand-800'} ${readOnly ? '' : 'hover:ring-2 hover:ring-brand-300'}`}>
                      <b>{e.subjectCode}</b>{e.batch ? ` · ${e.batch}` : ''}
                      <span className="block text-[10px] opacity-80">{mode === 'section' ? `${e.facultyName} · ${e.roomNumber}` : mode === 'faculty' ? `${e.section} · ${e.roomNumber}` : `${e.section} · ${e.facultyName}`}</span>
                    </button>))}
                </td>);
            })}</tr>))}</tbody>
      </table>
    </div>
  );
}

function ConflictPanel({ conflicts, report }: { conflicts: Conflict[]; report: ValidationReport | null }) {
  const [kind, setKind] = useState<'UNASSIGNED' | 'HARD' | 'INFEASIBLE'>('UNASSIGNED');
  const counts = { UNASSIGNED: 0, HARD: 0, INFEASIBLE: 0 };
  conflicts.forEach((c) => counts[c.kind]++);
  const list = conflicts.filter((c) => c.kind === kind);
  return (
    <Card>
      <h2 className="text-sm font-bold mb-3 flex items-center gap-2">Review: unassigned & conflicts {report?.valid && <span className="text-emerald-600 text-xs flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />validated clean</span>}</h2>
      <div className="flex gap-2 mb-3" role="tablist">{(['UNASSIGNED', 'HARD', 'INFEASIBLE'] as const).map((k) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`px-3 py-1 rounded-lg text-xs font-semibold ${kind === k ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'}`}>{k === 'UNASSIGNED' ? 'Unassigned' : k === 'HARD' ? 'Hard conflicts' : 'Infeasibility'} ({counts[k]})</button>)}</div>
      {list.length === 0 ? <p className="text-sm text-slate-400">Nothing to review here.</p> : <ul className="space-y-1.5 text-sm max-h-72 overflow-y-auto">{list.map((c) => <li key={c.id}><Badge color={c.kind === 'UNASSIGNED' ? 'amber' : 'red'}>{c.code}</Badge> {c.message}</li>)}</ul>}
    </Card>
  );
}

function EditModal({ gid, entry, tt, onClose, invalidate }: { gid: number; entry: Entry; tt: TimetableView; onClose: () => void; onDeleted: () => void; invalidate: unknown[][] }) {
  const { data: fac } = useFacultyProfiles();
  const { data: rooms = [] } = useQuery<{ id: number; roomNumber: string; type: string; capacity: number | null }[]>({ queryKey: ['rooms-all'], queryFn: () => api.get('/rooms', { params: { limit: 200 } }).then((r) => r.data.data) });
  const [f, setF] = useState({ day: entry.day as string, startPeriod: entry.startPeriod, facultyProfileId: entry.facultyProfileId, roomId: entry.roomId });
  const [bad, setBad] = useState<ValidationReport | null>(null);
  const done = () => { onClose(); };
  const save = useApiMutation((allowConflicts: boolean) => api.patch(`/generations/${gid}/entries/${entry.id}`, { ...f, allowConflicts }), { invalidate: invalidate as never, success: 'Entry updated', onSuccess: done });
  const del = useApiMutation(() => api.delete(`/generations/${gid}/entries/${entry.id}`), { invalidate: invalidate as never, success: 'Session removed (now unassigned)', onSuccess: done });
  const submit = (allow: boolean) => save.mutate(allow, { onError: (e) => { const r = errData(e); if (r?.data?.code === 'CONFLICT') setBad(r.data.details); } });
  const teaching = tt.periods.filter((p) => !p.isBreak);
  return (
    <Modal open onClose={onClose} size="lg" title={`Edit ${entry.subjectCode}${entry.batch ? ` (${entry.batch})` : ''} · ${entry.section}`}
      footer={<><Button variant="danger" size="sm" loading={del.isPending} onClick={() => del.mutate(undefined as never)}>Unschedule</Button><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => { setBad(null); submit(false); }}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Day" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} options={tt.days.map((d) => ({ value: d, label: d }))} />
        <Select label="Start period" value={f.startPeriod} onChange={(e) => setF({ ...f, startPeriod: Number(e.target.value) })} options={teaching.map((p) => ({ value: p.position, label: `${p.label} (${p.startTime})` }))} />
        <Select label="Faculty" value={f.facultyProfileId} onChange={(e) => setF({ ...f, facultyProfileId: Number(e.target.value) })} options={(fac?.items ?? []).map((p) => ({ value: p.id, label: p.user.name }))} />
        <Select label="Room" value={f.roomId} onChange={(e) => setF({ ...f, roomId: Number(e.target.value) })} options={rooms.map((r) => ({ value: r.id, label: `${r.roomNumber} · ${r.type}${r.capacity ? ` · ${r.capacity}` : ''}` }))} />
      </div>
      {entry.length > 1 && <p className="text-xs text-slate-500 mt-2">This session spans {entry.length} periods.</p>}
      {bad && (
        <div className="mt-4 border border-red-200 bg-red-50 rounded-xl p-3" role="alert">
          <p className="text-sm font-semibold text-red-700 mb-1">This change would create {bad.totalViolations} conflict(s) — it was not applied.</p>
          <ul className="text-xs text-red-700 space-y-0.5 max-h-32 overflow-y-auto">{bad.violations.map((v, i) => <li key={i}>• {v.message}</li>)}</ul>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => submit(true)}>Apply anyway (draft only; publishing stays blocked)</Button>
        </div>)}
      {save.isError && !bad && <p className="text-xs text-red-500 mt-2">{errMsg(save.error)}</p>}
    </Modal>
  );
}
