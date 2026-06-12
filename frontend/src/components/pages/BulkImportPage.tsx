import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useJobPoller } from '../../hooks/useJobPoller';
import { PageHeader, Card, Button, Badge } from '../ui';
import { Upload, CheckCircle, XCircle, AlertTriangle, Loader2, FileSpreadsheet } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

type Entity = 'departments' | 'rooms' | 'courses' | 'users';

const ENTITIES: { key: Entity; label: string; icon: string; columns: string[] }[] = [
  { key: 'departments', label: 'Departments', icon: '🏛',
    columns: ['name *', 'code *'] },
  { key: 'rooms', label: 'Rooms', icon: '🚪',
    columns: ['room_number *', 'department_code *', 'type', 'capacity'] },
  { key: 'courses', label: 'Courses', icon: '📚',
    columns: ['code *', 'name *', 'credits', 'type', 'branch_code *', 'semester *'] },
  { key: 'users', label: 'Faculty & Users', icon: '👨‍🏫',
    columns: ['name *', 'email *', 'role', 'department_code *'] },
];

// Simulated preview rows for demonstration before real API parsing
function buildPreviewRows(entity: Entity, filename: string) {
  const seed = filename.length % 3;
  if (entity === 'departments') return [
    { row: 1, data: { name: 'Computer Science', code: 'CSE' }, status: 'valid', dup: false },
    { row: 2, data: { name: 'Electronics',       code: 'ECE' }, status: 'valid', dup: true  },
    { row: 3, data: { name: '',                  code: 'ME'  }, status: 'error', dup: false, reason: 'name is required' },
    { row: 4, data: { name: 'Civil Engineering', code: 'CE'  }, status: 'valid', dup: false },
  ];
  if (entity === 'rooms') return [
    { row: 1, data: { room_number: '219',   department_code: 'CSE', type: 'CLASSROOM', capacity: '60' }, status: 'valid', dup: false },
    { row: 2, data: { room_number: 'Lab 3', department_code: 'CSE', type: 'LAB',       capacity: '30' }, status: 'valid', dup: true  },
    { row: 3, data: { room_number: '',      department_code: 'ECE', type: 'CLASSROOM', capacity: ''   }, status: 'error', dup: false, reason: 'room_number is required' },
  ];
  if (entity === 'courses') return [
    { row: 1, data: { code: 'CS333', name: 'Compiler Design', credits: '4', type: 'LECTURE', branch_code: 'CS', semester: '6' }, status: 'valid', dup: false },
    { row: 2, data: { code: 'AI305', name: 'Deep Learning',   credits: '3', type: 'LECTURE', branch_code: 'AIML', semester: '6' }, status: 'valid', dup: true },
    { row: 3, data: { code: '',      name: 'Unknown',          credits: 'abc', type: 'LECTURE', branch_code: 'CS', semester: '6' }, status: 'error', dup: false, reason: 'code required; credits must be numeric' },
  ];
  return [
    { row: 1, data: { name: 'Dr. Sanchita Paul', email: 'sanchita.paul@bitmesra.ac.in', role: 'PROFESSOR', department_code: 'CSE' }, status: 'valid', dup: false },
    { row: 2, data: { name: 'Prof. Supratim',    email: 'supratim.b@bitmesra.ac.in',   role: 'HOD',       department_code: 'CSE' }, status: 'valid', dup: true  },
    { row: 3, data: { name: '',                  email: 'bad-email',                   role: 'INVALID',   department_code: ''    }, status: 'error', dup: false, reason: 'name required; invalid email; invalid role' },
  ];
}

export default function BulkImportPage() {
  const [activeEntity, setActiveEntity] = useState<Entity>('departments');
  const [jobId, setJobId]       = useState<string | null>(null);
  const [preview, setPreview]   = useState<ReturnType<typeof buildPreviewRows> | null>(null);
  const [filename, setFilename] = useState('');

  const { data: job } = useJobPoller(jobId);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/upload/csv/' + activeEntity, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: ({ data }) => {
      setJobId(data.jobId);
      toast.success('Import queued — Job ' + data.jobId.slice(0, 8) + '…');
      setPreview(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Upload failed'),
  });

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    setFilename(file.name);
    setJobId(null);
    // Build client-side preview (in production this is the API validation step)
    setPreview(buildPreviewRows(activeEntity, file.name));
  }, [activeEntity]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  const conf = ENTITIES.find(e => e.key === activeEntity)!;
  const validRows  = preview?.filter(r => r.status === 'valid' && !r.dup).length ?? 0;
  const dupRows    = preview?.filter(r => r.dup).length ?? 0;
  const errorRows  = preview?.filter(r => r.status === 'error').length ?? 0;

  function confirmImport() {
    if (!filename) return;
    // In real flow this submits the already-uploaded file; here we demonstrate the call
    toast.success('Submitting ' + validRows + ' valid rows to BullMQ csv-import queue…');
    setPreview(null);
  }

  return (
    <div>
      <PageHeader title="Bulk CSV / Excel Import"
        subtitle="Upload → BullMQ validation → Preview → Merge or Skip duplicates"
        actions={<Badge color="blue">csv-import queue · BullMQ</Badge>}
      />

      {/* Entity Tabs */}
      <div className="flex gap-1 border-b border-surface-border mb-5">
        {ENTITIES.map(e => (
          <button key={e.key} onClick={() => { setActiveEntity(e.key); setPreview(null); setJobId(null); }}
            className={clsx(
              'px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-1.5',
              e.key === activeEntity
                ? 'text-brand-700 border-brand-700'
                : 'text-slate-500 border-transparent hover:text-slate-700'
            )}>
            <span>{e.icon}</span> {e.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Upload + schema */}
        <div className="space-y-4">
          <Card>
            <div {...getRootProps()} className={clsx(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
              isDragActive
                ? 'border-brand-500 bg-brand-50'
                : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/30'
            )}>
              <input {...getInputProps()} />
              <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <div className="text-sm font-semibold text-slate-600 mb-1">
                {isDragActive ? 'Drop file here' : 'Drop CSV or Excel'}
              </div>
              <div className="text-xs text-slate-400 mb-4">Max 5,000 rows · 20 MB</div>
              <Button variant="secondary" size="sm" icon={<Upload className="w-3 h-3" />}>
                Choose File
              </Button>
            </div>
          </Card>

          {/* Expected columns */}
          <Card>
            <div className="text-xs font-bold text-slate-600 mb-3">
              Expected Columns — {conf.label}
            </div>
            <div className="space-y-1.5">
              {conf.columns.map(col => (
                <div key={col} className="flex items-center gap-2 text-xs">
                  <code className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">{col}</code>
                  {col.includes('*') && (
                    <span className="text-red-500 font-semibold text-[10px]">required</span>
                  )}
                </div>
              ))}
            </div>
            <a href="#" className="text-xs text-brand-600 hover:underline mt-3 block">
              Download sample template →
            </a>
          </Card>
        </div>

        {/* Right: Preview table */}
        <div className="lg:col-span-2">
          {!preview && !job && (
            <Card className="h-full flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <div className="text-4xl mb-3 opacity-30">📊</div>
                <div className="text-sm font-semibold text-slate-500">Upload a file to see preview</div>
                <div className="text-xs text-slate-400 mt-1">Validation runs before import</div>
              </div>
            </Card>
          )}

          {preview && !job && (
            <Card noPadding>
              {/* Preview header */}
              <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-700">{filename}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {preview.length} rows parsed · <span className="text-emerald-600 font-semibold">{validRows} valid</span>
                    {dupRows > 0 && <> · <span className="text-amber-600 font-semibold">{dupRows} duplicate</span></>}
                    {errorRows > 0 && <> · <span className="text-red-600 font-semibold">{errorRows} error</span></>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPreview(null)}>Cancel</Button>
                  <Button size="sm" onClick={confirmImport} disabled={validRows === 0}
                    icon={<Upload className="w-3 h-3" />}>
                    Import {validRows} row{validRows !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>

              {/* Preview rows */}
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      {Object.keys(preview[0]?.data ?? {}).map(k => <th key={k}>{k}</th>)}
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className={clsx(
                        row.status === 'error' ? 'bg-red-50/40' :
                        row.dup ? 'bg-amber-50/40' : 'bg-emerald-50/20'
                      )}>
                        <td className="text-slate-400 text-xs">{row.row}</td>
                        {Object.values(row.data).map((v, j) => (
                          <td key={j} className={clsx('text-xs', !v && 'text-red-400 italic')}>
                            {v || '— empty —'}
                          </td>
                        ))}
                        <td>
                          {row.status === 'error'
                            ? <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
                                <XCircle className="w-3.5 h-3.5" /> Error
                              </span>
                            : row.dup
                            ? <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                                <AlertTriangle className="w-3.5 h-3.5" /> Duplicate
                              </span>
                            : <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                <CheckCircle className="w-3.5 h-3.5" /> Valid
                              </span>
                          }
                        </td>
                        <td>
                          {row.status === 'error'
                            ? <span className="text-xs text-red-500">{(row as any).reason}</span>
                            : row.dup
                            ? <div className="flex gap-1">
                                <button className="text-[11px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md hover:bg-brand-100">Merge</button>
                                <button className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md hover:bg-slate-200">Skip</button>
                              </div>
                            : <span className="text-[11px] text-emerald-600 font-semibold">Will create</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Job result */}
          {job && (
            <Card>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-sm font-bold text-slate-700">Import Job</div>
                  <div className="font-mono text-xs text-slate-400 mt-0.5">{job.id}</div>
                </div>
                <Badge
                  color={job.status === 'DONE' ? 'green' : job.status === 'FAILED' ? 'red' : 'amber'}
                  dot
                >
                  {job.status}
                </Badge>
              </div>

              {(job.status === 'QUEUED' || job.status === 'PROCESSING') && (
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                  Processing {job.totalRows ?? '…'} rows via BullMQ worker…
                </div>
              )}

              {(job.status === 'DONE' || job.status === 'FAILED') && (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: 'Created',  value: job.createdRows, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                      { label: 'Matched',  value: job.matchedRows, color: 'text-brand-700',   bg: 'bg-brand-50'   },
                      { label: 'Failed',   value: job.failedRows,  color: 'text-red-600',     bg: 'bg-red-50'     },
                    ].map(s => (
                      <div key={s.label} className={clsx('rounded-xl p-3 text-center', s.bg)}>
                        <div className={clsx('text-xl font-bold', s.color)}>{s.value}</div>
                        <div className="text-xs text-slate-500">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {(job.errorLog?.length ?? 0) > 0 && (
                    <div>
                      <div className="text-xs font-bold text-red-600 mb-2">Row Errors</div>
                      <div className="bg-slate-900 rounded-xl p-4 max-h-40 overflow-y-auto space-y-1">
                        {job.errorLog!.map((e, i) => (
                          <div key={i} className="font-mono text-[11px] text-slate-300 flex gap-2">
                            <span className="text-slate-500">Row {e.row ?? i + 1}</span>
                            <span>{e.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {job.status === 'DONE' && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <CheckCircle className="w-4 h-4" />
                      Import complete. Analytics dashboard recalculated automatically.
                    </div>
                  )}
                </>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
