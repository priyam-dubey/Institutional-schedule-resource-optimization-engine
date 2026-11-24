import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, RefreshCw, XCircle, Trash2, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import { useCan } from '../../lib/authStore';
import { useApiMutation, useCurrentSemester, useGenerations, useSections, statusColor, type Generation } from '../../lib/scheduling';
import SemesterPicker from '../common/SemesterPicker';
import { Badge, Button, Card, EmptyState, Input, PageHeader, ProgressBar, TableSkeleton } from '../ui';

export default function GenerationPage() {
  const can = useCan('HOD');
  const { current } = useCurrentSemester();
  const { data: sections = [] } = useSections(current?.id);
  const { data: gens = [], isLoading } = useGenerations(current?.id);
  const [picked, setPicked] = useState<number[]>([]);
  const [cfg, setCfg] = useState({ name: '', timeLimitSec: 30, seed: '' });
  const inv = [['generations']];
  const start = useApiMutation(() => api.post('/generations', {
    semesterId: current!.id, sectionIds: picked, name: cfg.name || undefined,
    config: { timeLimitMs: Math.round(cfg.timeLimitSec * 1000), ...(cfg.seed !== '' ? { seed: Number(cfg.seed) } : {}) },
  }), { invalidate: inv, success: 'Generation queued', onSuccess: () => setPicked([]) });
  const regen = useApiMutation((id: number) => api.post(`/generations/${id}/regenerate`, {}), { invalidate: inv, success: 'Regeneration queued' });
  const cancel = useApiMutation((id: number) => api.post(`/generations/${id}/cancel`), { invalidate: inv, success: 'Cancelled' });
  const del = useApiMutation((id: number) => api.delete(`/generations/${id}`), { invalidate: inv, success: 'Deleted' });
  const allPicked = sections.length > 0 && picked.length === sections.length;

  return (
    <div className="space-y-6">
      <PageHeader title="Generate Timetable" subtitle="Constraint-based generation runs in the background; progress streams live" actions={<SemesterPicker />} />
      <Card>
        <h2 className="text-sm font-bold mb-3">1 · Choose sections</h2>
        {!current ? <EmptyState icon="📅" title="Create a semester first" /> : sections.length === 0 ? <EmptyState icon="🏷️" title="No sections in this semester" subtitle="Add sections and their requirements first." /> : (
          <>
            <label className="flex items-center gap-2 text-sm mb-2 font-semibold"><input type="checkbox" checked={allPicked} onChange={(e) => setPicked(e.target.checked ? sections.map((s) => s.id) : [])} />Select all</label>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {sections.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm border border-surface-border rounded-xl px-3 py-2">
                  <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />
                  {s.program.code}-{s.yearOfStudy}{s.name}<span className="text-xs text-slate-400 ml-auto">{s._count?.requirements ?? 0} req</span>
                </label>))}
            </div>
            <h2 className="text-sm font-bold mt-5 mb-3">2 · Options</h2>
            <div className="grid md:grid-cols-4 gap-3 items-end">
              <Input label="Name (optional)" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} />
              <Input label="Time limit (seconds)" type="number" min={1} max={300} value={cfg.timeLimitSec} onChange={(e) => setCfg({ ...cfg, timeLimitSec: Number(e.target.value) })} />
              <Input label="Seed (optional, for reproducibility)" type="number" min={0} value={cfg.seed} onChange={(e) => setCfg({ ...cfg, seed: e.target.value })} />
              <Button icon={<Play className="w-4 h-4" />} disabled={!can || picked.length === 0} loading={start.isPending} onClick={() => start.mutate(undefined as never)}>Generate{picked.length ? ` (${picked.length})` : ''}</Button>
            </div>
            {!can && <p className="text-xs text-slate-500 mt-2">Only HODs and above can start a generation.</p>}
          </>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-bold mb-3">Generations (versions)</h2>
        {isLoading ? <TableSkeleton rows={3} cols={5} /> : gens.length === 0 ? <EmptyState icon="🧮" title="No generations yet" /> : (
          <ul className="divide-y divide-surface-border">{gens.map((g) => <Row key={g.id} g={g} can={can} onRegen={() => regen.mutate(g.id)} onCancel={() => cancel.mutate(g.id)} onDelete={() => del.mutate(g.id)} />)}</ul>
        )}
      </Card>
    </div>
  );
}

function Row({ g, can, onRegen, onCancel, onDelete }: { g: Generation; can: boolean; onRegen: () => void; onCancel: () => void; onDelete: () => void }) {
  const active = g.status === 'QUEUED' || g.status === 'RUNNING';
  return (
    <li className="py-3 flex flex-col gap-2" data-testid={`gen-${g.id}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-semibold text-sm">v{g.version}{g.name ? ` · ${g.name}` : ''}</span>
        <Badge color={statusColor(g.status)}>{g.status}</Badge>
        {g.solveStatus && <Badge color={statusColor(g.solveStatus)}>{g.solveStatus}</Badge>}
        <Badge color={statusColor(g.publishStatus)}>{g.publishStatus}</Badge>
        {g.source === 'IMPORTED' && <Badge color="purple">imported</Badge>}
        {g.status === 'COMPLETED' && <span className="text-xs text-slate-500">{g.assignedSessions}/{g.totalSessions} sessions{g.score != null && ` · score ${g.score.toFixed(0)}`}{g.durationMs != null && ` · ${(g.durationMs / 1000).toFixed(1)}s`}</span>}
        <span className="ml-auto flex gap-1">
          {g.status === 'COMPLETED' && <Link to={`/timetables/${g.id}`}><Button size="sm" variant="secondary" icon={<ExternalLink className="w-3.5 h-3.5" />}>Open</Button></Link>}
          {can && active && <Button size="sm" variant="secondary" icon={<XCircle className="w-3.5 h-3.5" />} onClick={onCancel}>Cancel</Button>}
          {can && !active && g.source === 'GENERATED' && <Button size="sm" variant="secondary" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={onRegen}>Regenerate</Button>}
          {can && !active && g.publishStatus !== 'PUBLISHED' && <Button size="sm" variant="ghost" aria-label={`Delete v${g.version}`} onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>}
        </span>
      </div>
      {active && <div><ProgressBar value={g.progress} showLabel /><p className="text-xs text-slate-500 mt-1">{g.progressMessage}</p></div>}
      {g.status === 'FAILED' && <p className="text-xs text-red-600">{g.errorMessage}</p>}
    </li>
  );
}
