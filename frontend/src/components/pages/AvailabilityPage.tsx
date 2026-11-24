import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore, useCan } from '../../lib/authStore';
import { useApiMutation, useCurrentSemester, useFacultyProfiles, useSubjects, type Day, type Semester } from '../../lib/scheduling';
import AvailabilityGrid, { fromKeyMap, toKeyMap, type Mark } from '../common/AvailabilityGrid';
import SemesterPicker from '../common/SemesterPicker';
import { Button, Card, EmptyState, Input, PageHeader, Skeleton } from '../ui';

interface RoomRow { id: number; roomNumber: string; departmentId: number; capacity: number | null; type: 'CLASSROOM' | 'LAB' | 'OTHER'; building?: string | null; equipment?: string[]; isActive?: boolean }

export default function AvailabilityPage() {
  const [tab, setTab] = useState<'faculty' | 'rooms'>('faculty');
  return (
    <div className="space-y-6">
      <PageHeader title="Faculty & Room Availability" subtitle="Qualifications, workload limits, unavailable/preferred slots and room equipment — all enforced by the timetable engine" actions={<SemesterPicker />} />
      <div className="flex gap-2" role="tablist">
        {(['faculty', 'rooms'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-xl text-sm font-semibold ${tab === t ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'}`}>{t === 'faculty' ? 'Faculty' : 'Rooms'}</button>)}
      </div>
      {tab === 'faculty' ? <FacultyTab /> : <RoomsTab />}
    </div>
  );
}

function useGrid() {
  const { current } = useCurrentSemester();
  const { data: sem } = useQuery<Semester>({ queryKey: ['semester', current?.id], enabled: !!current, queryFn: () => api.get(`/semesters/${current!.id}`).then((r) => r.data) });
  return { current, days: (sem?.workingDays ?? []) as Day[], periods: sem?.periods ?? [] };
}

function FacultyTab() {
  const me = useAuthStore((s) => s.user);
  const canCoord = useCan('COORDINATOR');
  const { data, isLoading } = useFacultyProfiles();
  const { data: subjects = [] } = useSubjects(null);
  const { current, days, periods } = useGrid();
  const [sel, setSel] = useState<number | null>(null);
  const profile = data?.items.find((p) => p.id === sel) ?? data?.items.find((p) => p.userId === me?.id) ?? data?.items[0];
  const editable = !!profile && (canCoord || profile.userId === me?.id);
  const avail = useQuery<Record<string, Mark>>({ queryKey: ['fac-avail', profile?.id, current?.id], enabled: !!profile && !!current, queryFn: () => api.get(`/faculty-profiles/${profile!.id}/availability`, { params: { semesterId: current!.id } }).then((r) => toKeyMap(r.data.items)) });
  const [grid, setGrid] = useState<Record<string, Mark>>({});
  const [quals, setQuals] = useState<number[]>([]);
  const [limits, setLimits] = useState({ maxPeriodsPerWeek: 20, maxConsecutive: 3 });
  useEffect(() => { if (avail.data) setGrid(avail.data); }, [avail.data]);
  useEffect(() => { if (profile) { setQuals(profile.qualifications.map((q) => q.subjectId)); setLimits({ maxPeriodsPerWeek: profile.maxPeriodsPerWeek, maxConsecutive: profile.maxConsecutive }); } }, [profile?.id, profile?.qualifications.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveAvail = useApiMutation(() => api.put(`/faculty-profiles/${profile!.id}/availability`, { semesterId: current!.id, slots: fromKeyMap(grid) }), { invalidate: [['fac-avail']], success: 'Availability saved' });
  const saveQuals = useApiMutation(() => api.put(`/faculty-profiles/${profile!.id}/qualifications`, { subjectIds: quals }), { invalidate: [['faculty-profiles']], success: 'Qualifications saved' });
  const saveLimits = useApiMutation(() => api.patch(`/faculty-profiles/${profile!.id}`, limits), { invalidate: [['faculty-profiles']], success: 'Limits saved' });
  const create = useApiMutation((userId: number) => api.post('/faculty-profiles', { userId }), { invalidate: [['faculty-profiles']], success: 'Faculty profile created' });

  if (isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6">
      <Card className="!p-3 max-h-[70vh] overflow-y-auto">
        <ul>{data?.items.map((p) => (
          <li key={p.id}><button className={`w-full text-left px-3 py-2 rounded-lg text-sm ${p.id === profile?.id ? 'bg-brand-50 font-semibold' : 'hover:bg-slate-50'}`} onClick={() => setSel(p.id)}>{p.user.name}<span className="block text-[11px] text-slate-400">{p.qualifications.length} subjects</span></button></li>
        ))}</ul>
        {canCoord && (data?.usersWithoutProfile.length ?? 0) > 0 && (
          <div className="mt-3 border-t border-surface-border pt-3"><h4 className="text-[11px] font-bold text-slate-500 uppercase mb-1">Users without a faculty profile</h4>
            {data!.usersWithoutProfile.map((u) => <div key={u.id} className="flex items-center justify-between text-xs py-1">{u.name}<Button size="sm" variant="secondary" onClick={() => create.mutate(u.id)}>Create</Button></div>)}</div>
        )}
      </Card>
      {!profile ? <EmptyState icon="👩‍🏫" title="No faculty profiles yet" subtitle="Create profiles for teaching users." /> : (
        <div className="space-y-6">
          <Card>
            <h3 className="text-sm font-bold mb-3">{profile.user.name} <span className="text-xs text-slate-400 font-normal">{profile.user.email}</span></h3>
            <div className="flex gap-3 items-end mb-4">
              <Input label="Max periods / week" type="number" min={1} max={60} value={limits.maxPeriodsPerWeek} disabled={!editable} onChange={(e) => setLimits({ ...limits, maxPeriodsPerWeek: Number(e.target.value) })} />
              <Input label="Max consecutive" type="number" min={1} max={8} value={limits.maxConsecutive} disabled={!editable} onChange={(e) => setLimits({ ...limits, maxConsecutive: Number(e.target.value) })} />
              <Button variant="secondary" disabled={!editable} loading={saveLimits.isPending} onClick={() => saveLimits.mutate(undefined as never)}>Save limits</Button>
            </div>
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Qualified subjects</h4>
            <div className="max-h-40 overflow-y-auto grid grid-cols-2 gap-1 mb-3">{subjects.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canCoord} checked={quals.includes(s.id)} onChange={(e) => setQuals(e.target.checked ? [...quals, s.id] : quals.filter((x) => x !== s.id))} />{s.code} <span className="text-xs text-slate-400">{s.name}</span></label>
            ))}</div>
            <Button size="sm" disabled={!canCoord} loading={saveQuals.isPending} icon={<Save className="w-3.5 h-3.5" />} onClick={() => saveQuals.mutate(undefined as never)}>Save qualifications</Button>
          </Card>
          <Card>
            <h3 className="text-sm font-bold mb-3">Availability in {current ? current.name : 'selected semester'}</h3>
            {!current || periods.length === 0 ? <p className="text-xs text-amber-600">Configure the semester's period grid first.</p> : (
              <>
                <AvailabilityGrid days={days} periods={periods} value={grid} onChange={setGrid} allowPreferred disabled={!editable} />
                <Button className="mt-3" size="sm" disabled={!editable} loading={saveAvail.isPending} icon={<Save className="w-3.5 h-3.5" />} onClick={() => saveAvail.mutate(undefined as never)}>Save availability</Button>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function RoomsTab() {
  const can = useCan('COORDINATOR');
  const { current, days, periods } = useGrid();
  const { data: rooms = [], isLoading } = useQuery<RoomRow[]>({ queryKey: ['rooms-all'], queryFn: () => api.get('/rooms', { params: { limit: 200 } }).then((r) => r.data.data) });
  const [sel, setSel] = useState<number | null>(null);
  const room = rooms.find((r) => r.id === sel) ?? rooms[0];
  const avail = useQuery<Record<string, Mark>>({ queryKey: ['room-avail', room?.id, current?.id], enabled: !!room && !!current, queryFn: () => api.get(`/rooms/${room!.id}/availability`, { params: { semesterId: current!.id } }).then((r) => toKeyMap(r.data.items)) });
  const [grid, setGrid] = useState<Record<string, Mark>>({});
  const [equip, setEquip] = useState('');
  const [building, setBuilding] = useState('');
  useEffect(() => { if (avail.data) setGrid(avail.data); }, [avail.data]);
  useEffect(() => { if (room) { setEquip((room.equipment ?? []).join(', ')); setBuilding(room.building ?? ''); } }, [room?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveAvail = useApiMutation(() => api.put(`/rooms/${room!.id}/availability`, { semesterId: current!.id, slots: fromKeyMap(grid).map(({ day, periodIndex }) => ({ day, periodIndex })) }), { invalidate: [['room-avail']], success: 'Room availability saved' });
  const saveRoom = useApiMutation(() => api.put(`/rooms/${room!.id}`, { roomNumber: room!.roomNumber, departmentId: room!.departmentId, capacity: room!.capacity, type: room!.type, building: building || null, equipment: equip.split(',').map((s) => s.trim()).filter(Boolean) }), { invalidate: [['rooms-all'], ['rooms']], success: 'Room updated' });
  if (isLoading) return <Skeleton className="h-40" />;
  if (!room) return <EmptyState icon="🚪" title="No rooms yet" subtitle="Add rooms on the Rooms page." />;
  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6">
      <Card className="!p-3 max-h-[70vh] overflow-y-auto"><ul>{rooms.map((r) => (
        <li key={r.id}><button className={`w-full text-left px-3 py-2 rounded-lg text-sm ${r.id === room.id ? 'bg-brand-50 font-semibold' : 'hover:bg-slate-50'}`} onClick={() => setSel(r.id)}>{r.roomNumber}<span className="block text-[11px] text-slate-400">{r.type} · {r.capacity ?? 'capacity missing'}</span></button></li>
      ))}</ul></Card>
      <div className="space-y-6">
        <Card>
          <h3 className="text-sm font-bold mb-3">{room.roomNumber}</h3>
          {room.capacity == null && <p className="text-xs text-amber-600 mb-2">No capacity set — this room is excluded from scheduling until you set one on the Rooms page.</p>}
          <div className="grid md:grid-cols-3 gap-3 items-end">
            <Input label="Building" value={building} disabled={!can} onChange={(e) => setBuilding(e.target.value)} />
            <Input label="Equipment (comma separated)" value={equip} disabled={!can} onChange={(e) => setEquip(e.target.value)} placeholder="projector, computers" />
            <Button variant="secondary" disabled={!can} loading={saveRoom.isPending} onClick={() => saveRoom.mutate(undefined as never)}>Save room</Button>
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-bold mb-3">Blocked periods</h3>
          {!current || periods.length === 0 ? <p className="text-xs text-amber-600">Configure the semester's period grid first.</p> : (
            <><AvailabilityGrid days={days} periods={periods} value={grid} onChange={setGrid} disabled={!can} />
              <Button className="mt-3" size="sm" disabled={!can} loading={saveAvail.isPending} icon={<Save className="w-3.5 h-3.5" />} onClick={() => saveAvail.mutate(undefined as never)}>Save blocked periods</Button></>
          )}
        </Card>
      </div>
    </div>
  );
}
