import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import {
  PageHeader, Card, Button, Input, Select, Badge, TableSkeleton,
  Pagination, EmptyState, Modal, ConfirmDialog, ProgressBar
} from '../ui';
import { Plus, Search, AlertTriangle } from 'lucide-react';
import type { Room, Department, PaginatedResponse, RoomType } from '../../types';
import toast from 'react-hot-toast';

const ROOM_TYPES: RoomType[] = ['CLASSROOM', 'LAB', 'OTHER'];
const TYPE_COLOR: Record<RoomType, 'blue' | 'purple' | 'slate'> = {
  CLASSROOM: 'blue', LAB: 'purple', OTHER: 'slate'
};

function RoomModal({ open, onClose, depts, initial }: {
  open: boolean; onClose: () => void; depts: Department[]; initial?: Room;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    roomNumber:   initial?.roomNumber ?? '',
    departmentId: initial?.departmentId?.toString() ?? '',
    type:         (initial?.type ?? 'CLASSROOM') as RoomType,
    capacity:     initial?.capacity?.toString() ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (d: object) =>
      initial ? api.put('/rooms/' + initial.id, d) : api.post('/rooms', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(initial ? 'Room updated' : 'Room created');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Operation failed'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!form.roomNumber.trim()) e2.roomNumber = 'Room number is required';
    if (!form.departmentId) e2.departmentId = 'Department is required';
    setErrors(e2);
    if (Object.keys(e2).length) return;
    mutation.mutate({
      roomNumber: form.roomNumber.trim(),
      departmentId: Number(form.departmentId),
      type: form.type,
      capacity: form.capacity ? Number(form.capacity) : null,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Room' : 'Add Room'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={mutation.isPending}>{initial ? 'Save' : 'Create Room'}</Button>
        </>
      }>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Room Number *" placeholder="e.g. 219, Lab 3, G2"
          value={form.roomNumber} error={errors.roomNumber}
          onChange={e => setForm(f => ({ ...f, roomNumber: e.target.value }))} autoFocus />
        <Select label="Department *" placeholder="Select department…"
          error={errors.departmentId}
          options={depts.map(d => ({ value: d.id, label: d.code + ' — ' + d.name }))}
          value={form.departmentId}
          onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} />
        <Select label="Room Type *"
          options={ROOM_TYPES.map(t => ({ value: t, label: t }))}
          value={form.type}
          onChange={e => setForm(f => ({ ...f, type: e.target.value as RoomType }))} />
        <Input label="Capacity (seats)" type="number" placeholder="Leave blank to flag as missing"
          value={form.capacity}
          onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
        {!form.capacity && (
          <p className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Room will be flagged as "Capacity Missing"
          </p>
        )}
      </form>
    </Modal>
  );
}

export default function RoomsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debSearch = useDebounce(search);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Room | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Room>>({
    queryKey: ['rooms', page, debSearch, typeFilter],
    queryFn: () => api.get('/rooms', { params: { page, search: debSearch, type: typeFilter || undefined } }).then(r => r.data),
  });

  const { data: depts } = useQuery<PaginatedResponse<Department>>({
    queryKey: ['departments', 1, ''],
    queryFn: () => api.get('/departments', { params: { limit: 100 } }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete('/rooms/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rooms'] }); toast.success('Room deleted'); setDeleteTarget(null); },
    onError: (err: any) => { toast.error(err.response?.data?.error ?? 'Delete failed'); setDeleteTarget(null); },
  });

  return (
    <div>
      <PageHeader
        title="Rooms & Venues"
        subtitle={(data?.meta.total ?? 0) + ' rooms · Composite unique: (room_number, department)'}
        actions={
          <>
            <Button variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => {}}>Bulk Import</Button>
            <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddOpen(true)}>Add Room</Button>
          </>
        }
      />
      <Card noPadding>
        <div className="p-4 border-b border-surface-border flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input className="input pl-9" placeholder="Search rooms…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="select w-36"
            value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">All Types</option>
            {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {isLoading ? <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
          : (data?.data.length ?? 0) === 0
          ? <EmptyState icon="🚪" title="No rooms found" subtitle="Add your first room or adjust filters."
              action={<Button onClick={() => setAddOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>Add Room</Button>} />
          : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr><th>Room</th><th>Dept</th><th>Type</th><th>Capacity</th><th>Utilisation</th><th className="text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {data!.data.map(r => (
                    <tr key={r.id} className="group">
                      <td className="font-semibold">{r.roomNumber}</td>
                      <td><Badge color="blue">{r.department?.code}</Badge></td>
                      <td><Badge color={TYPE_COLOR[r.type]}>{r.type}</Badge></td>
                      <td>
                        {r.capacity != null
                          ? <span className="text-slate-600">{r.capacity} seats</span>
                          : <span className="flex items-center gap-1 text-amber-600 text-xs font-semibold">
                              <AlertTriangle className="w-3 h-3" /> Missing
                            </span>
                        }
                      </td>
                      <td className="min-w-[140px]">
                        <ProgressBar value={r.utilization ?? 0} showLabel />
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditTarget(r)} className="text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg hover:bg-brand-100">Edit</button>
                          <button onClick={() => setDeleteTarget(r)} className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg hover:bg-red-100">Delete</button>
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

      <RoomModal open={addOpen} onClose={() => setAddOpen(false)} depts={depts?.data ?? []} />
      {editTarget && <RoomModal open={!!editTarget} onClose={() => setEditTarget(null)} depts={depts?.data ?? []} initial={editTarget} />}
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending} title="Delete Room" confirmLabel="Delete"
        message={<>Delete room <strong>{deleteTarget?.roomNumber}</strong>? This cannot be undone if timetable slots reference it.</>} />
    </div>
  );
}
