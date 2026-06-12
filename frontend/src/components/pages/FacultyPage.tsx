import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import {
  PageHeader, Card, Button, Input, Select, RoleBadge, TableSkeleton,
  EmptyState, Modal, ConfirmDialog, Badge
} from '../ui';
import { Plus, Search, RotateCcw, Trash2 } from 'lucide-react';
import type { User, Department, PaginatedResponse, Role } from '../../types';
import toast from 'react-hot-toast';

const ROLES: Role[] = ['ADMIN', 'DEAN', 'HOD', 'COORDINATOR', 'PROFESSOR'];

function FacultyModal({ open, onClose, depts, initial }: {
  open: boolean; onClose: () => void; depts: Department[]; initial?: User;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: initial?.name ?? '', email: initial?.email ?? '',
    role: (initial?.role ?? 'PROFESSOR') as Role,
    departmentId: initial?.departmentId?.toString() ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (d: object) => initial ? api.put('/users/' + initial.id, d) : api.post('/users', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faculty'] });
      toast.success(initial ? 'Faculty updated' : 'Faculty created');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Operation failed'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!form.name.trim()) e2.name = 'Name required';
    if (!form.email.trim()) e2.email = 'Email required';
    if (!form.departmentId) e2.departmentId = 'Department required';
    setErrors(e2);
    if (Object.keys(e2).length) return;
    mutation.mutate({ name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role, departmentId: Number(form.departmentId) });
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Faculty' : 'Add Faculty'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={mutation.isPending}>{initial ? 'Save' : 'Create'}</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Full Name *" placeholder="e.g. Dr. Sanchita Paul" value={form.name} error={errors.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
        <Input label="Email *" type="email" placeholder="faculty@bitmesra.ac.in" value={form.email} error={errors.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Role *" options={ROLES.map(r => ({ value: r, label: r }))} value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))} />
          <Select label="Department *" placeholder="Select…" error={errors.departmentId}
            options={depts.map(d => ({ value: d.id, label: d.code }))} value={form.departmentId}
            onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} />
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs text-blue-700">
          Faculty accounts support soft-delete — deleted accounts are recoverable by HOD or above.
        </div>
      </form>
    </Modal>
  );
}

export default function FacultyPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [softDeleteTarget, setSoftDeleteTarget] = useState<User | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<User | null>(null);
  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const debSearch = useDebounce(search);

  const { data, isLoading } = useQuery<User[]>({
    queryKey: ['faculty', debSearch, roleFilter, tab],
    queryFn: () => api.get('/users', {
      params: { search: debSearch, role: roleFilter || undefined, includeDeleted: tab === 'deleted' }
    }).then(r => r.data),
  });

  const { data: depts } = useQuery<{ data: Department[] }>({
    queryKey: ['departments', 1, ''],
    queryFn: () => api.get('/departments', { params: { limit: 100 } }).then(r => r.data),
  });

  const softDeleteMutation = useMutation({
    mutationFn: (id: number) => api.delete('/users/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['faculty'] }); toast.success('User soft-deleted. Recoverable.'); setSoftDeleteTarget(null); },
    onError: (err: any) => { toast.error(err.response?.data?.error ?? 'Delete failed'); setSoftDeleteTarget(null); },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => api.post('/users/' + id + '/restore'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['faculty'] }); toast.success('User restored.'); setRestoreTarget(null); },
    onError: () => { toast.error('Restore failed'); setRestoreTarget(null); },
  });

  const displayData = (data ?? []).filter(u => tab === 'deleted' ? u.isDeleted : !u.isDeleted);

  return (
    <div>
      <PageHeader title="Faculty & Users"
        subtitle={(data?.filter(u => !u.isDeleted).length ?? 0) + ' active · Soft-delete enabled'}
        actions={<Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddOpen(true)}>Add Faculty</Button>}
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-surface-border mb-4">
        {(['active', 'deleted'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${t === tab ? 'text-brand-700 border-brand-700' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>
            {t === 'active' ? 'Active Users' : 'Soft-Deleted'}
          </button>
        ))}
      </div>

      <Card noPadding>
        <div className="p-4 border-b border-surface-border flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input className="input pl-9" placeholder="Search by name or email…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select w-40" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {isLoading ? <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
          : displayData.length === 0
          ? <EmptyState icon="👨‍🏫" title={tab === 'deleted' ? 'No deleted users' : 'No faculty found'}
              subtitle={tab === 'deleted' ? 'No soft-deleted records exist.' : 'Add faculty members to get started.'}
              action={tab === 'active' ? <Button onClick={() => setAddOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>Add Faculty</Button> : undefined} />
          : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Status</th><th className="text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {displayData.map(u => (
                    <tr key={u.id} className={`group ${u.isDeleted ? 'opacity-50' : ''}`}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-brand-gradient flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                            {u.name.split(' ').map(w => w[0]).slice(-2).join('')}
                          </div>
                          <span className="font-semibold text-slate-700">{u.name}</span>
                        </div>
                      </td>
                      <td className="text-slate-500 text-xs font-mono">{u.email}</td>
                      <td><RoleBadge role={u.role} /></td>
                      <td><Badge color="blue">{u.department?.code}</Badge></td>
                      <td>
                        {u.isDeleted
                          ? <Badge color="red" dot>Deleted</Badge>
                          : <Badge color="green" dot>Active</Badge>}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!u.isDeleted && (
                            <>
                              <button onClick={() => setEditTarget(u)} className="text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg hover:bg-brand-100">Edit</button>
                              <button onClick={() => setSoftDeleteTarget(u)} className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg hover:bg-red-100 flex items-center gap-1">
                                <Trash2 className="w-3 h-3" /> Soft Delete
                              </button>
                            </>
                          )}
                          {u.isDeleted && (
                            <button onClick={() => setRestoreTarget(u)} className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg hover:bg-emerald-100 flex items-center gap-1">
                              <RotateCcw className="w-3 h-3" /> Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Card>

      <FacultyModal open={addOpen} onClose={() => setAddOpen(false)} depts={depts?.data ?? []} />
      {editTarget && <FacultyModal open={!!editTarget} onClose={() => setEditTarget(null)} depts={depts?.data ?? []} initial={editTarget} />}
      <ConfirmDialog open={!!softDeleteTarget} onClose={() => setSoftDeleteTarget(null)}
        onConfirm={() => softDeleteTarget && softDeleteMutation.mutate(softDeleteTarget.id)}
        loading={softDeleteMutation.isPending} title="Soft Delete User" confirmLabel="Soft Delete"
        message={<><strong>{softDeleteTarget?.name}</strong> will be soft-deleted. Their timetable assignments are preserved. An HOD or Admin can restore them.</>} />
      <ConfirmDialog open={!!restoreTarget} onClose={() => setRestoreTarget(null)}
        onConfirm={() => restoreTarget && restoreMutation.mutate(restoreTarget.id)}
        loading={restoreMutation.isPending} title="Restore User" confirmLabel="Restore"
        message={<>Restore <strong>{restoreTarget?.name}</strong>? Their account will become active again.</>} />
    </div>
  );
}
