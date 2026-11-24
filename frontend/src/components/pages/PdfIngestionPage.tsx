import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Trash2, Plus, ShieldCheck, Save, CheckCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { ALL_DAYS, errData, errMsg, useApiMutation, useCurrentSemester, useFacultyProfiles, useSections, type Day, type Semester } from '../../lib/scheduling';
import SemesterPicker from '../common/SemesterPicker';
import { Badge, Button, Card, EmptyState, PageHeader, Select, ProgressBar } from '../ui';

interface Row { id: string; day: Day; periodLabel: string; raw: string; subjectCode: string; roomNumber: string | null; batchName: string | null; facultyProfileId: number | null; length: number; matched?: boolean }
interface Issue { rowId: string | null; severity: 'error' | 'warning'; code: string; message: string }
interface Job { id: string; status: string; filename: string | null; progress: number; totalRows: number | null; payload: { meta: Record<string, string>; rows: Row[]; warnings?: string[] } | null; errorLog: { reason: string }[] | null; committedGenerationId: number | null }

export default function PdfIngestionPage() {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    const fd = new FormData(); fd.append('file', files[0]);
    setUploading(true);
    try {
      const r = await api.post('/upload/pdf', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setJobId(r.data.jobId); toast.success('PDF uploaded — extracting');
    } catch (e) { toast.error(errMsg(e)); } finally { setUploading(false); }
    qc.invalidateQueries({ queryKey: ['ingestion'] });
  }, [qc]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, maxSize: 10 * 1024 * 1024, disabled: uploading });

  const jobs = useQuery<{ id: string; status: string; filename: string | null; totalRows: number | null; createdAt: string }[]>({ queryKey: ['ingestion', 'list'], queryFn: () => api.get('/ingestion').then((r) => r.data.items) });

  return (
    <div className="space-y-6">
      <PageHeader title="PDF Ingestion" subtitle="Upload a grid timetable PDF → review and correct the extracted rows → validate → commit as a draft timetable. Nothing is saved until you commit." />
      <Card>
        <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer ${isDragActive ? 'border-brand-400 bg-brand-50' : 'border-surface-border'}`}>
          <input {...getInputProps()} aria-label="PDF file" />
          <Upload className="w-6 h-6 mx-auto text-slate-400 mb-2" />
          <p className="text-sm text-slate-600">{uploading ? 'Uploading…' : 'Drop a timetable PDF here, or click to choose (max 10 MB)'}</p>
        </div>
      </Card>
      {jobId && <Review key={jobId} jobId={jobId} onDone={() => qc.invalidateQueries({ queryKey: ['ingestion'] })} />}
      <Card>
        <h2 className="text-sm font-bold mb-3">Recent PDF jobs</h2>
        {!jobs.data?.length ? <p className="text-sm text-slate-400">No jobs yet.</p> : (
          <ul className="divide-y divide-surface-border text-sm">{jobs.data.map((j) => (
            <li key={j.id} className="py-2 flex items-center gap-3"><span className="truncate">{j.filename}</span><Badge color={j.status === 'DONE' ? 'green' : j.status === 'FAILED' ? 'red' : j.status === 'AWAITING_REVIEW' ? 'amber' : 'slate'}>{j.status}</Badge>
              {j.status === 'AWAITING_REVIEW' && <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setJobId(j.id)}>Review</Button>}</li>))}</ul>
        )}
      </Card>
    </div>
  );
}

function Review({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const { data: job } = useQuery<Job>({ queryKey: ['ingestion', jobId], queryFn: () => api.get(`/ingestion/${jobId}`).then((r) => r.data), refetchInterval: (q) => (['QUEUED', 'PROCESSING'].includes(q.state.data?.status ?? 'QUEUED') ? 1000 : false) });
  const { current } = useCurrentSemester();
  const { data: sections = [] } = useSections(current?.id);
  const { data: fac } = useFacultyProfiles();
  const { data: sem } = useQuery<Semester>({ queryKey: ['semester', current?.id], enabled: !!current, queryFn: () => api.get(`/semesters/${current!.id}`).then((r) => r.data) });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sectionId, setSectionId] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [validated, setValidated] = useState(false);
  const [committed, setCommitted] = useState<number | null>(null);
  useEffect(() => { if (job?.payload && rows === null) setRows(job.payload.rows); }, [job, rows]);

  const labels = (sem?.periods ?? []).filter((p) => !p.isBreak).map((p) => p.label);
  const target = { semesterId: current?.id as number, sectionId: Number(sectionId) };
  const edit = (id: string, patch: Partial<Row>) => { setRows((rows ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r))); setValidated(false); };
  const save = useApiMutation(() => api.put(`/ingestion/${jobId}/payload`, { meta: job?.payload?.meta ?? {}, rows }), { success: 'Edits saved' });
  const validate = useApiMutation(async () => { await api.put(`/ingestion/${jobId}/payload`, { meta: job?.payload?.meta ?? {}, rows }); return api.post(`/ingestion/${jobId}/validate`, target).then((r) => r.data as { ok: boolean; issues: Issue[] }); },
    { onSuccess: (r) => { setIssues(r.issues); setValidated(r.ok); toast[r.ok ? 'success' : 'error'](r.ok ? 'Validation passed' : `${r.issues.filter((i) => i.severity === 'error').length} problem(s) to fix`); } });
  const commit = useApiMutation(() => api.post(`/ingestion/${jobId}/commit`, { ...target, name: job?.payload?.meta?.title?.slice(0, 120) }).then((r) => r.data as { generationId: number }),
    { success: 'Imported as a draft timetable', onSuccess: (r) => { setCommitted(r.generationId); onDone(); } });
  const discard = useApiMutation(() => api.post(`/ingestion/${jobId}/discard`), { success: 'Discarded', onSuccess: () => { setRows([]); onDone(); } });

  if (!job) return null;
  if (job.status === 'QUEUED' || job.status === 'PROCESSING') return <Card><p className="text-sm mb-2">Extracting {job.filename}…</p><ProgressBar value={job.progress} showLabel /></Card>;
  if (job.status === 'FAILED') return <Card><p className="text-sm text-red-600 font-semibold">Extraction failed</p><p className="text-xs text-slate-500 mt-1">{job.errorLog?.[0]?.reason}</p></Card>;
  if (committed || job.status === 'DONE') return <Card><p className="text-sm text-emerald-700 font-semibold flex items-center gap-2"><CheckCheck className="w-4 h-4" />Imported.</p>{(committed ?? job.committedGenerationId) && <Link to={`/timetables/${committed ?? job.committedGenerationId}`}><Button className="mt-3">Open the imported timetable</Button></Link>}</Card>;
  if (job.status === 'CANCELLED') return <Card><p className="text-sm text-slate-500">This import was discarded.</p></Card>;

  const issueOf = (id: string) => issues.filter((i) => i.rowId === id);
  const general = issues.filter((i) => !i.rowId);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const meta = job.payload?.meta ?? {};
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div><h2 className="text-sm font-bold">Review extracted rows</h2><p className="text-xs text-slate-500">{job.filename} · detected {Object.entries(meta).filter(([k]) => k !== 'title').map(([k, v]) => `${k}: ${v}`).join(' · ') || 'no metadata'}</p></div>
        <SemesterPicker />
        <div className="w-56"><Select aria-label="Target section" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setValidated(false); }} options={sections.map((s) => ({ value: s.id, label: `${s.program.code}-${s.yearOfStudy}${s.name}` }))} placeholder="Import into section…" /></div>
      </div>
      {general.length > 0 && <ul className="text-xs mb-3 space-y-0.5">{general.map((g, i) => <li key={i} className={g.severity === 'error' ? 'text-red-600' : 'text-amber-600'}>{g.severity === 'error' ? '✕' : '⚠'} {g.message}</li>)}</ul>}
      {!rows?.length ? <EmptyState icon="📄" title="No rows left" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th>Day</th><th>Period</th><th>Subject</th><th>Room</th><th>Faculty</th><th>Batch</th><th>Len</th><th>Printed</th><th /></tr></thead>
            <tbody>{rows.map((r) => {
              const iss = issueOf(r.id);
              return (
                <tr key={r.id} className={`border-t border-surface-border align-top ${iss.some((i) => i.severity === 'error') ? 'bg-red-50/60' : ''}`} data-row={r.id}>
                  <td><select className="select !py-1" aria-label={`Day ${r.id}`} value={r.day} onChange={(e) => edit(r.id, { day: e.target.value as Day })}>{ALL_DAYS.map((d) => <option key={d}>{d}</option>)}</select></td>
                  <td><select className="select !py-1" aria-label={`Period ${r.id}`} value={r.periodLabel} onChange={(e) => edit(r.id, { periodLabel: e.target.value })}>{[...new Set([r.periodLabel, ...labels])].map((l) => <option key={l}>{l}</option>)}</select></td>
                  <td><input className="input !py-1 w-24" aria-label={`Subject ${r.id}`} value={r.subjectCode} onChange={(e) => edit(r.id, { subjectCode: e.target.value })} /></td>
                  <td><input className="input !py-1 w-20" aria-label={`Room ${r.id}`} value={r.roomNumber ?? ''} onChange={(e) => edit(r.id, { roomNumber: e.target.value || null })} /></td>
                  <td><select className="select !py-1" aria-label={`Faculty ${r.id}`} value={r.facultyProfileId ?? ''} onChange={(e) => edit(r.id, { facultyProfileId: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{fac?.items.map((p) => <option key={p.id} value={p.id}>{p.user.name}</option>)}</select></td>
                  <td><input className="input !py-1 w-14" aria-label={`Batch ${r.id}`} value={r.batchName ?? ''} onChange={(e) => edit(r.id, { batchName: e.target.value || null })} /></td>
                  <td><input className="input !py-1 w-12" type="number" min={1} max={4} aria-label={`Length ${r.id}`} value={r.length} onChange={(e) => edit(r.id, { length: Number(e.target.value) })} /></td>
                  <td className="text-slate-400 max-w-[120px] truncate" title={r.raw}>{r.raw}</td>
                  <td><Button size="sm" variant="ghost" aria-label={`Remove row ${r.id}`} onClick={() => { setRows(rows.filter((x) => x.id !== r.id)); setValidated(false); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                    {iss.map((i, k) => <div key={k} className={`text-[11px] ${i.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>{i.message}</div>)}</td>
                </tr>);
            })}</tbody></table>
        </div>)}
      <div className="flex gap-2 mt-4 flex-wrap">
        <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setRows([...(rows ?? []), { id: `n${Date.now()}`, day: 'MONDAY', periodLabel: labels[0] ?? 'I', raw: '', subjectCode: '', roomNumber: null, batchName: null, facultyProfileId: null, length: 1 }]); setValidated(false); }}>Add row</Button>
        <Button size="sm" variant="secondary" icon={<Save className="w-3.5 h-3.5" />} loading={save.isPending} onClick={() => save.mutate(undefined as never)}>Save edits</Button>
        <Button size="sm" icon={<ShieldCheck className="w-3.5 h-3.5" />} disabled={!sectionId || !current} loading={validate.isPending} onClick={() => validate.mutate(undefined as never)}>Validate</Button>
        <Button size="sm" disabled={!validated} loading={commit.isPending} onClick={() => commit.mutate(undefined as never)}>Commit as draft timetable</Button>
        <Button size="sm" variant="ghost" icon={<X className="w-3.5 h-3.5" />} onClick={() => discard.mutate(undefined as never)}>Discard</Button>
        {errors > 0 && <span className="text-xs text-red-600 self-center">{errors} error(s) must be fixed before committing</span>}
        {commit.isError && errData(commit.error)?.data?.code === 'VALIDATION_FAILED' && <span className="text-xs text-red-600 self-center">Validation failed — re-validate and fix the highlighted rows.</span>}
      </div>
    </Card>
  );
}
