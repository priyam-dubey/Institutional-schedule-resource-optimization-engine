import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useCan } from '../../lib/authStore';
import { useApiMutation, useDepartments, usePrograms, useSubjects } from '../../lib/scheduling';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, TableSkeleton } from '../ui';

export default function AcademicStructurePage() {
  const [tab, setTab] = useState<'programs' | 'subjects'>('programs');
  return (
    <div className="space-y-6">
      <PageHeader title="Programs & Subjects" subtitle="Normalised academic structure: a department offers programs and subjects; sections and requirements reference them" />
      <div className="flex gap-2" role="tablist">
        {(['programs', 'subjects'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-xl text-sm font-semibold ${tab === t ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'}`}>{t === 'programs' ? 'Programs' : 'Subjects'}</button>
        ))}
      </div>
      {tab === 'programs' ? <Programs /> : <Subjects />}
    </div>
  );
}

function Programs() {
  const can = useCan('HOD');
  const { data = [], isLoading } = usePrograms();
  const { data: depts = [] } = useDepartments();
  const [f, setF] = useState({ departmentId: '', code: '', name: '', level: 'UG', durationYears: 4 });
  const add = useApiMutation(() => api.post('/programs', { ...f, departmentId: Number(f.departmentId), durationYears: Number(f.durationYears) }), { invalidate: [['programs']], success: 'Program created', onSuccess: () => setF({ ...f, code: '', name: '' }) });
  const del = useApiMutation((id: number) => api.delete(`/programs/${id}`), { invalidate: [['programs']], success: 'Program deleted' });
  return (
    <Card>
      {isLoading ? <TableSkeleton rows={3} cols={4} /> : data.length === 0 ? <EmptyState icon="🎓" title="No programs yet" subtitle={can ? 'Add one below.' : undefined} /> : (
        <table className="w-full text-sm mb-4"><thead><tr className="text-xs text-slate-500 text-left"><th className="py-1">Code</th><th>Name</th><th>Department</th><th>Level</th><th>Years</th><th>Sections</th><th /></tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.id} className="border-t border-surface-border"><td className="py-2 font-semibold">{p.code}</td><td>{p.name}</td><td>{p.department?.code}</td><td>{p.level}</td><td>{p.durationYears}</td><td>{p._count?.sections ?? 0}</td>
              <td>{can && <Button size="sm" variant="ghost" aria-label={`Delete program ${p.code}`} onClick={() => del.mutate(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}</td></tr>
          ))}</tbody></table>
      )}
      {can && (
        <form className="grid md:grid-cols-6 gap-3 items-end" onSubmit={(e) => { e.preventDefault(); add.mutate(undefined as never); }}>
          <Select label="Department" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })} options={depts.map((d) => ({ value: d.id, label: d.code }))} placeholder="Select" required />
          <Input label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required />
          <div className="md:col-span-2"><Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></div>
          <Input label="Years" type="number" min={1} max={8} value={f.durationYears} onChange={(e) => setF({ ...f, durationYears: Number(e.target.value) })} />
          <Button type="submit" icon={<Plus className="w-4 h-4" />} loading={add.isPending}>Add</Button>
        </form>
      )}
    </Card>
  );
}

function Subjects() {
  const can = useCan('HOD');
  const [dept, setDept] = useState('');
  const { data = [], isLoading } = useSubjects(dept ? Number(dept) : null);
  const { data: depts = [] } = useDepartments();
  const blank = { departmentId: '', code: '', name: '', credits: 3, type: 'LECTURE', defaultSessionsPerWeek: 3, defaultBlockLength: 1, requiredRoomType: 'CLASSROOM', equipment: '' };
  const [f, setF] = useState(blank);
  const add = useApiMutation(() => api.post('/subjects', {
    departmentId: Number(f.departmentId), code: f.code, name: f.name, credits: Number(f.credits), type: f.type,
    defaultSessionsPerWeek: Number(f.defaultSessionsPerWeek), defaultBlockLength: Number(f.defaultBlockLength), requiredRoomType: f.requiredRoomType,
    requiredEquipment: f.equipment.split(',').map((s) => s.trim()).filter(Boolean),
  }), { invalidate: [['subjects']], success: 'Subject created', onSuccess: () => setF({ ...blank, departmentId: f.departmentId }) });
  const del = useApiMutation((id: number) => api.delete(`/subjects/${id}`), { invalidate: [['subjects']], success: 'Subject deleted' });
  const isLab = f.type === 'LAB';
  return (
    <Card>
      <div className="w-56 mb-3"><Select aria-label="Filter department" value={dept} onChange={(e) => setDept(e.target.value)} options={depts.map((d) => ({ value: d.id, label: d.code }))} placeholder="All departments" /></div>
      {isLoading ? <TableSkeleton rows={4} cols={6} /> : data.length === 0 ? <EmptyState icon="📚" title="No subjects yet" /> : (
        <table className="w-full text-sm mb-4"><thead><tr className="text-xs text-slate-500 text-left"><th className="py-1">Code</th><th>Name</th><th>Type</th><th>Credits</th><th>Sessions/wk</th><th>Block</th><th>Room</th><th /></tr></thead>
          <tbody>{data.map((s) => (
            <tr key={s.id} className="border-t border-surface-border"><td className="py-2 font-semibold">{s.code}</td><td>{s.name}</td><td><Badge color={s.type === 'LAB' ? 'purple' : 'blue'}>{s.type}</Badge></td><td>{s.credits}</td><td>{s.defaultSessionsPerWeek}</td><td>{s.defaultBlockLength}</td>
              <td>{s.requiredRoomType}{s.requiredEquipment.length > 0 && <span className="text-xs text-slate-400"> · {s.requiredEquipment.join(', ')}</span>}</td>
              <td>{can && <Button size="sm" variant="ghost" aria-label={`Delete subject ${s.code}`} onClick={() => del.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}</td></tr>
          ))}</tbody></table>
      )}
      {can && (
        <form className="grid md:grid-cols-4 gap-3 items-end" onSubmit={(e) => { e.preventDefault(); add.mutate(undefined as never); }}>
          <Select label="Department" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })} options={depts.map((d) => ({ value: d.id, label: d.code }))} placeholder="Select" required />
          <Input label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required />
          <div className="md:col-span-2"><Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <Select label="Type" value={f.type} onChange={(e) => { const t = e.target.value; setF({ ...f, type: t, ...(t === 'LAB' ? { requiredRoomType: 'LAB', defaultBlockLength: 2, defaultSessionsPerWeek: 1 } : {}) }); }} options={['LECTURE', 'LAB', 'TUTORIAL'].map((v) => ({ value: v, label: v }))} />
          <Input label="Credits" type="number" min={0} step={0.5} value={f.credits} onChange={(e) => setF({ ...f, credits: Number(e.target.value) })} />
          <Input label="Sessions / week" type="number" min={1} max={12} value={f.defaultSessionsPerWeek} onChange={(e) => setF({ ...f, defaultSessionsPerWeek: Number(e.target.value) })} />
          <Input label="Block length (periods)" type="number" min={1} max={4} value={f.defaultBlockLength} onChange={(e) => setF({ ...f, defaultBlockLength: Number(e.target.value) })} />
          <Select label="Room type" value={f.requiredRoomType} onChange={(e) => setF({ ...f, requiredRoomType: e.target.value })} options={['CLASSROOM', 'LAB', 'OTHER'].map((v) => ({ value: v, label: v }))} />
          <div className="md:col-span-2"><Input label="Required equipment (comma separated)" value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })} placeholder={isLab ? 'e.g. computers' : ''} /></div>
          <Button type="submit" icon={<Plus className="w-4 h-4" />} loading={add.isPending}>Add subject</Button>
        </form>
      )}
    </Card>
  );
}
