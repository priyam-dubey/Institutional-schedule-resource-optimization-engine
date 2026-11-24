import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, ListPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { useCan } from '../../lib/authStore';
import { useApiMutation, useCurrentSemester, usePrograms, useSections, useSubjects, useFacultyProfiles, type Section } from '../../lib/scheduling';
import SemesterPicker from '../common/SemesterPicker';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Select, TableSkeleton } from '../ui';

interface Req { id: number; sectionId: number; batchId: number | null; subjectId: number; sessionsPerWeek: number; blockLength: number; roomType: string; requiredEquipment: string[]; subject: { code: string; name: string; type: string }; batch: { name: string } | null; assignedFaculty: { id: number; user: { name: string } } | null }

export default function SectionsPage() {
  const can = useCan('HOD');
  const { current } = useCurrentSemester();
  const { data: sections = [], isLoading } = useSections(current?.id);
  const { data: programs = [] } = usePrograms();
  const [f, setF] = useState({ programId: '', yearOfStudy: 1, name: '', strength: 60, batches: 2 });
  const [open, setOpen] = useState<Section | null>(null);
  const add = useApiMutation(() => {
    const n = Number(f.batches);
    const per = n > 0 ? Math.ceil(Number(f.strength) / n) : 0;
    return api.post('/sections', { programId: Number(f.programId), semesterId: current!.id, yearOfStudy: Number(f.yearOfStudy), name: f.name, strength: Number(f.strength), batches: Array.from({ length: n }, (_, i) => ({ name: `B${i + 1}`, strength: Math.min(per, Number(f.strength)) })) });
  }, { invalidate: [['sections']], success: 'Section created', onSuccess: () => setF({ ...f, name: '' }) });
  const del = useApiMutation((id: number) => api.delete(`/sections/${id}`), { invalidate: [['sections']], success: 'Section deleted' });

  return (
    <div className="space-y-6">
      <PageHeader title="Sections & Requirements" subtitle="Sections, lab batches and the weekly teaching requirements the engine must schedule" actions={<SemesterPicker />} />
      <Card>
        {!current ? <EmptyState icon="📅" title="Create a semester first" subtitle="Go to Institution & Calendar." /> : isLoading ? <TableSkeleton rows={3} cols={5} /> : sections.length === 0 ? <EmptyState icon="🏷️" title="No sections in this semester" /> : (
          <table className="w-full text-sm"><thead><tr className="text-xs text-slate-500 text-left"><th className="py-1">Section</th><th>Strength</th><th>Batches</th><th>Requirements</th><th /></tr></thead>
            <tbody>{sections.map((s) => (
              <tr key={s.id} className="border-t border-surface-border">
                <td className="py-2 font-semibold">{s.program.code}-{s.yearOfStudy}{s.name}</td><td>{s.strength}</td>
                <td>{s.batches.length ? s.batches.map((b) => <Badge key={b.id} color="slate">{b.name} ({b.strength})</Badge>) : <span className="text-xs text-slate-400">none</span>}</td>
                <td>{s._count?.requirements ?? 0}</td>
                <td className="text-right space-x-1"><Button size="sm" variant="secondary" onClick={() => setOpen(s)}>Requirements</Button>{can && <Button size="sm" variant="ghost" aria-label={`Delete section ${s.name}`} onClick={() => del.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}</td>
              </tr>))}</tbody></table>
        )}
        {can && current && (
          <form className="grid md:grid-cols-6 gap-3 items-end mt-5" onSubmit={(e) => { e.preventDefault(); add.mutate(undefined as never); }}>
            <Select label="Program" value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })} options={programs.map((p) => ({ value: p.id, label: p.code }))} placeholder="Select" required />
            <Input label="Year" type="number" min={1} max={8} value={f.yearOfStudy} onChange={(e) => setF({ ...f, yearOfStudy: Number(e.target.value) })} />
            <Input label="Section name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
            <Input label="Strength" type="number" min={1} value={f.strength} onChange={(e) => setF({ ...f, strength: Number(e.target.value) })} />
            <Input label="Lab batches" type="number" min={0} max={12} value={f.batches} onChange={(e) => setF({ ...f, batches: Number(e.target.value) })} />
            <Button type="submit" icon={<Plus className="w-4 h-4" />} loading={add.isPending}>Add section</Button>
          </form>
        )}
      </Card>
      {open && <RequirementsModal section={open} onClose={() => setOpen(null)} can={can} />}
    </div>
  );
}

function RequirementsModal({ section, onClose, can }: { section: Section; onClose: () => void; can: boolean }) {
  const { data: reqs = [], isLoading } = useQuery<Req[]>({ queryKey: ['requirements', section.id], queryFn: () => api.get('/requirements', { params: { sectionId: section.id } }).then((r) => r.data.items) });
  const { data: subjects = [] } = useSubjects(section.program.departmentId);
  const { data: fac } = useFacultyProfiles();
  const [pick, setPick] = useState<number[]>([]);
  const inv = [['requirements', section.id], ['sections']];
  const apply = useApiMutation(() => api.post(`/sections/${section.id}/requirements/apply-defaults`, { subjectIds: pick }), { invalidate: inv, success: 'Requirements added', onSuccess: () => setPick([]) });
  const del = useApiMutation((id: number) => api.delete(`/requirements/${id}`), { invalidate: inv });
  const patch = useApiMutation((v: { id: number; body: object }) => api.patch(`/requirements/${v.id}`, v.body), { invalidate: inv, success: 'Saved' });
  const have = new Set(reqs.map((r) => r.subjectId));
  const candidates = subjects.filter((s) => !have.has(s.id) || s.type === 'LAB');
  const qualified = (subjectId: number) => (fac?.items ?? []).filter((p) => p.qualifications.some((q) => q.subjectId === subjectId));

  return (
    <Modal open onClose={onClose} size="lg" title={`Requirements · ${section.program.code}-${section.yearOfStudy}${section.name}`}>
      {isLoading ? <TableSkeleton rows={3} cols={5} /> : reqs.length === 0 ? <EmptyState icon="📝" title="No requirements" subtitle="Pick subjects below to add them with their default sessions." /> : (
        <table className="w-full text-sm mb-4"><thead><tr className="text-xs text-slate-500 text-left"><th>Subject</th><th>Batch</th><th>Sessions/wk</th><th>Block</th><th>Room</th><th>Faculty</th><th /></tr></thead>
          <tbody>{reqs.map((r) => (
            <tr key={r.id} className="border-t border-surface-border">
              <td className="py-1.5"><b>{r.subject.code}</b> <span className="text-xs text-slate-400">{r.subject.name}</span></td><td>{r.batch?.name ?? 'whole'}</td>
              <td>{can ? <input className="input !py-1 w-16" type="number" min={1} max={12} aria-label={`Sessions ${r.subject.code}`} defaultValue={r.sessionsPerWeek} onBlur={(e) => Number(e.target.value) !== r.sessionsPerWeek && patch.mutate({ id: r.id, body: { sessionsPerWeek: Number(e.target.value) } })} /> : r.sessionsPerWeek}</td>
              <td>{r.blockLength}</td><td>{r.roomType}</td>
              <td>{can ? (
                <select className="select !py-1" aria-label={`Faculty ${r.subject.code}`} value={r.assignedFaculty?.id ?? ''} onChange={(e) => patch.mutate({ id: r.id, body: { assignedFacultyId: e.target.value ? Number(e.target.value) : null } })}>
                  <option value="">Auto (any qualified)</option>
                  {qualified(r.subjectId).map((p) => <option key={p.id} value={p.id}>{p.user.name}</option>)}
                </select>) : (r.assignedFaculty?.user.name ?? 'Auto')}</td>
              <td>{can && <Button size="sm" variant="ghost" aria-label={`Remove requirement ${r.subject.code}`} onClick={() => del.mutate(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}</td>
            </tr>))}</tbody></table>
      )}
      {can && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Add subjects (uses each subject's defaults; labs are created per batch)</h4>
          <div className="max-h-40 overflow-y-auto grid grid-cols-2 gap-1 mb-3">
            {candidates.length === 0 && <span className="text-xs text-slate-400">All subjects already added</span>}
            {candidates.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pick.includes(s.id)} onChange={(e) => setPick(e.target.checked ? [...pick, s.id] : pick.filter((x) => x !== s.id))} />{s.code} <span className="text-xs text-slate-400">{s.name}</span></label>
            ))}
          </div>
          <Button icon={<ListPlus className="w-4 h-4" />} disabled={pick.length === 0} loading={apply.isPending} onClick={() => apply.mutate(undefined as never)}>Add {pick.length || ''} selected</Button>
        </div>
      )}
    </Modal>
  );
}
