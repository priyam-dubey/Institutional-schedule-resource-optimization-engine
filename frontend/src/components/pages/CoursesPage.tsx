import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import {
  PageHeader, Card, Button, Input, Select, Badge, TableSkeleton,
  Pagination, EmptyState, Modal, ConfirmDialog
} from '../ui';
import { Plus, Search, AlertTriangle } from 'lucide-react';
import type { Course, Branch, PaginatedResponse, CourseType } from '../../types';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const COURSE_TYPES: CourseType[] = ['LECTURE', 'LAB', 'TUTORIAL'];

function CourseModal({ open, onClose, branches, initial }: {
  open: boolean; onClose: () => void; branches: Branch[]; initial?: Course;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: initial?.code ?? '', name: initial?.name ?? '',
    credits: initial?.credits?.toString() ?? '3',
    type: (initial?.type ?? 'LECTURE') as CourseType,
    branchId: initial?.branchId?.toString() ?? '',
    semester: initial?.semester?.toString() ?? '6',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (d: object) =>
      initial ? api.put('/courses/' + initial.id, d) : api.post('/courses', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast.success(initial ? 'Course updated' : 'Course created');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Operation failed'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!form.code.trim()) e2.code = 'Course code required';
    if (!form.name.trim()) e2.name = 'Course name required';
    if (!form.branchId) e2.branchId = 'Branch required';
    setErrors(e2);
    if (Object.keys(e2).length) return;
    mutation.mutate({
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      credits: Number(form.credits),
      type: form.type,
      branchId: Number(form.branchId),
      semester: Number(form.semester),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Course' : 'Add Course'} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={mutation.isPending}>{initial ? 'Save' : 'Create'}</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Course Code *" placeholder="e.g. CS333" value={form.code} error={errors.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} autoFocus />
          <Input label="Credits" type="number" step="0.5" min="0" max="10" value={form.credits}
            onChange={e => setForm(f => ({ ...f, credits: e.target.value }))} />
        </div>
        <Input label="Course Name *" placeholder="e.g. Compiler Design" value={form.name} error={errors.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <div className="grid grid-cols-3 gap-3">
          <Select label="Type *" options={COURSE_TYPES.map(t => ({ value: t, label: t }))} value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as CourseType }))} />
          <Select label="Branch *" placeholder="Select…" error={errors.branchId}
            options={branches.map(b => ({ value: b.id, label: b.code }))} value={form.branchId}
            onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))} />
          <Select label="Semester *"
            options={Array.from({ length: 8 }, (_, i) => ({ value: i + 1, label: 'Sem ' + (i + 1) }))}
            value={form.semester}
            onChange={e => setForm(f => ({ ...f, semester: e.target.value }))} />
        </div>
        {Number(form.credits) === 0 && (
          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
            Credits = 0 will be tracked as NC (Non-Credit) course
          </p>
        )}
      </form>
    </Modal>
  );
}

export default function CoursesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [semFilter, setSemFilter] = useState('');
  const debSearch = useDebounce(search);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Course>>({
    queryKey: ['courses', page, debSearch, typeFilter, semFilter],
    queryFn: () => api.get('/courses', {
      params: { page, search: debSearch, type: typeFilter || undefined, semester: semFilter || undefined }
    }).then(r => r.data),
  });

  // Fetch branches for the modal
  const { data: branchesData } = useQuery<{ data: Branch[] }>({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches', { params: { limit: 100 } }).then(r => r.data),
    staleTime: 60_000,
  });
  const branches = branchesData?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete('/courses/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); toast.success('Course deleted'); setDeleteTarget(null); },
    onError: (err: any) => { toast.error(err.response?.data?.error ?? 'Delete failed'); setDeleteTarget(null); },
  });

  return (
    <div>
      <PageHeader title="Courses & Subjects"
        subtitle={(data?.meta.total ?? 0) + ' courses · Filter by branch, semester, type'}
        actions={<Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddOpen(true)}>Add Course</Button>}
      />
      <Card noPadding>
        <div className="p-4 border-b border-surface-border flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input className="input pl-9" placeholder="Search courses…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="select w-32" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">All Types</option>
            {COURSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select w-32" value={semFilter} onChange={e => { setSemFilter(e.target.value); setPage(1); }}>
            <option value="">All Sems</option>
            {Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>Sem {i + 1}</option>)}
          </select>
        </div>

        {isLoading ? <div className="p-4"><TableSkeleton rows={6} cols={7} /></div>
          : (data?.data.length ?? 0) === 0
          ? <EmptyState icon="📚" title="No courses found" subtitle="Add courses or adjust filters."
              action={<Button onClick={() => setAddOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>Add Course</Button>} />
          : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr><th>Code</th><th>Name</th><th>Credits</th><th>Type</th><th>Branch</th><th>Sem</th><th>Schedule</th><th className="text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {data!.data.map(c => (
                    <tr key={c.id} className="group">
                      <td><code className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono">{c.code}</code></td>
                      <td className="font-medium text-slate-700 max-w-[200px] truncate" title={c.name}>{c.name}</td>
                      <td>
                        {Number(c.credits) === 0
                          ? <Badge color="slate">NC</Badge>
                          : <span className="text-slate-600">{c.credits}</span>}
                      </td>
                      <td><Badge color={c.type === 'LAB' ? 'purple' : c.type === 'TUTORIAL' ? 'amber' : 'blue'}>{c.type}</Badge></td>
                      <td><Badge color="indigo">{c.branch?.code}</Badge></td>
                      <td className="text-slate-500">Sem {c.semester}</td>
                      <td>
                        {c.underRunning
                          ? <span className={clsx('flex items-center gap-1 text-xs font-semibold text-amber-600')}>
                              <AlertTriangle className="w-3 h-3" /> {c.scheduled}/{c.required}
                            </span>
                          : <span className="text-xs font-semibold text-emerald-600">✓ {c.scheduled}/{c.required}</span>
                        }
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditTarget(c)} className="text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg hover:bg-brand-100">Edit</button>
                          <button onClick={() => setDeleteTarget(c)} className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg hover:bg-red-100">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        {data && <div className="px-4 pb-4"><Pagination page={page} pages={data.meta.pages} total={data.meta.total} onPage={setPage} /></div>}
      </Card>

      <CourseModal open={addOpen} onClose={() => setAddOpen(false)} branches={branches} />
      {editTarget && <CourseModal open={!!editTarget} onClose={() => setEditTarget(null)} branches={branches} initial={editTarget} />}
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending} title="Delete Course" confirmLabel="Delete"
        message={<>Delete <strong>{deleteTarget?.code} — {deleteTarget?.name}</strong>? All timetable slots for this course will also be removed.</>} />
    </div>
  );
}
