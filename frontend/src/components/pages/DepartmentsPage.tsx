import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import {
  PageHeader, Card, Button, Input, Select, Badge, TableSkeleton,
  Pagination, EmptyState, Modal, ConfirmDialog
} from '../ui';
import { Plus, Search, Upload, Building2 } from 'lucide-react';
import type { Department, PaginatedResponse } from '../../types';
import toast from 'react-hot-toast';

// ─── Form ─────────────────────────────────────────────────────────────────────
interface DeptForm { name: string; code: string; }
const EMPTY_FORM: DeptForm = { name: '', code: '' };

function DeptModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Department }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<DeptForm>(initial ? { name: initial.name, code: initial.code } : EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<DeptForm>>({});

  const mutation = useMutation({
    mutationFn: (data: DeptForm) =>
      initial ? api.put('/departments/' + initial.id, data) : api.post('/departments', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      toast.success(initial ? 'Department updated' : 'Department created');
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error ?? 'Operation failed';
      toast.error(msg);
    },
  });

  function validate() {
    const e: Partial<DeptForm> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.code.trim()) e.code = 'Code is required';
    if (form.code.length > 20) e.code = 'Code must be ≤ 20 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate({ name: form.name.trim(), code: form.code.trim().toUpperCase() });
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Department' : 'Add Department'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={mutation.isPending}>
            {initial ? 'Save Changes' : 'Create Department'}
          </Button>
        </>
      }>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Department Name" placeholder="e.g. Computer Science & Engineering"
          value={form.name} error={errors.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
        <Input label="Short Code" placeholder="e.g. CSE"
          value={form.code} error={errors.code}
          onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
        <Select label="Programme" placeholder="Select…"
          options={[{ value: 'B.Tech', label: 'B.Tech' }, { value: 'M.Tech', label: 'M.Tech' }, { value: 'PhD', label: 'PhD' }]}
          defaultValue="B.Tech" onChange={() => {}} />
      </form>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DepartmentsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Department>>({
    queryKey: ['departments', page, debouncedSearch],
    queryFn: () => api.get('/departments', { params: { page, search: debouncedSearch } }).then(r => r.data),
    staleTime: 10_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete('/departments/' + id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department deleted');
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      const d = err.response?.data;
      if (d?.dependents) {
        toast.error('Cannot delete: ' + Object.entries(d.dependents).map(([k, v]) => v + ' ' + k).join(', ') + ' exist');
      } else {
        toast.error(d?.error ?? 'Delete failed');
      }
      setDeleteTarget(null);
    },
  });

  return (
    <div>
      <PageHeader
        title="Departments"
        subtitle={(data?.meta.total ?? 0) + ' departments · Searchable · Paginated'}
        actions={
          <>
            <Button variant="secondary" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => {}}>
              Bulk Import
            </Button>
            <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddOpen(true)}>
              Add Department
            </Button>
          </>
        }
      />

      <Card noPadding>
        {/* Search bar */}
        <div className="p-4 border-b border-surface-border flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input className="input pl-9" placeholder="Search by name or code…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>

        {/* Table */}
        {isLoading ? <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
          : (data?.data.length ?? 0) === 0
          ? <EmptyState icon="🏛" title="No departments found"
              subtitle="Add your first department or adjust the search filter."
              action={<Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddOpen(true)}>Add Department</Button>} />
          : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Department</th><th>Code</th><th>Rooms</th><th>Faculty</th><th>Branches</th><th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.data.map(d => (
                    <tr key={d.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-3.5 h-3.5 text-brand-700" />
                          </div>
                          <span className="font-semibold text-slate-700">{d.name}</span>
                        </div>
                      </td>
                      <td><Badge color="blue">{d.code}</Badge></td>
                      <td className="text-slate-500">{d._count?.rooms ?? 0}</td>
                      <td className="text-slate-500">{d._count?.users ?? 0}</td>
                      <td className="text-slate-500">{d._count?.branches ?? 0}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditTarget(d)}
                            className="text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg hover:bg-brand-100 transition-colors">
                            Edit
                          </button>
                          <button onClick={() => setDeleteTarget(d)}
                            className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors">
                            Delete
                          </button>
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

      {/* Modals */}
      <DeptModal open={addOpen} onClose={() => setAddOpen(false)} />
      {editTarget && <DeptModal open={!!editTarget} onClose={() => setEditTarget(null)} initial={editTarget} />}
      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        title="Delete Department"
        confirmLabel="Delete"
        message={<>Deleting <strong>{deleteTarget?.name}</strong> will cascade to all dependent rooms, courses, and timetable slots. This cannot be undone.</>}
      />
    </div>
  );
}
