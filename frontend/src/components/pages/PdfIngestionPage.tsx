import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useJobPoller } from '../../hooks/useJobPoller';
import { PageHeader, Card, Button, Badge } from '../ui';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import type { JobStatus } from '../../types';

const STEPS = [
  { key: 'QUEUED',      label: 'Queued',      icon: FileText },
  { key: 'PROCESSING',  label: 'Parsing',     icon: Loader2 },
  { key: 'PROCESSING2', label: 'Integrating', icon: Loader2 },
  { key: 'DONE',        label: 'Done',        icon: CheckCircle },
] as const;

function stepIndex(status: JobStatus | undefined) {
  if (!status || status === 'QUEUED') return 0;
  if (status === 'PROCESSING') return 1;
  if (status === 'DONE') return 3;
  if (status === 'FAILED') return -1;
  return 0;
}

export default function PdfIngestionPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useJobPoller(jobId);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/upload/pdf', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: ({ data }) => {
      setJobId(data.jobId);
      toast.success('PDF queued for processing (Job ' + data.jobId.slice(0, 8) + '…)');
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Upload failed'),
  });

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) uploadMutation.mutate(accepted[0]);
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const activeStep = stepIndex(job?.status);
  const done = job?.status === 'DONE';
  const failed = job?.status === 'FAILED';

  return (
    <div>
      <PageHeader title="PDF Timetable Ingestion"
        subtitle="Generic structural parser — works for any BIT Mesra department"
        actions={
          <Badge color="blue">BullMQ · pdf-parse queue</Badge>
        }
      />

      {/* Pipeline Steps */}
      <div className="flex items-start gap-0 mb-6">
        {STEPS.map((step, i) => {
          const isDone   = !failed && activeStep > i;
          const isActive = !failed && activeStep === i && !!jobId;
          const Icon = step.icon;
          return (
            <div key={step.key} className="flex-1 flex flex-col items-center relative">
              {i < STEPS.length - 1 && (
                <div className={clsx(
                  'absolute top-[18px] left-1/2 w-full h-0.5 transition-colors duration-500',
                  isDone ? 'bg-emerald-400' : 'bg-slate-200'
                )} />
              )}
              <div className={clsx(
                'w-9 h-9 rounded-full flex items-center justify-center border-2 relative z-10 transition-all duration-300',
                isDone  ? 'bg-emerald-500 border-emerald-500 text-white' :
                isActive ? 'bg-brand-gradient border-brand-500 text-white' :
                failed  ? 'bg-red-500 border-red-500 text-white' :
                'bg-white border-slate-200 text-slate-400'
              )}>
                {isDone ? <CheckCircle className="w-4 h-4" />
                  : isActive ? <Icon className="w-4 h-4 animate-spin" />
                  : <span className="text-xs font-bold">{i + 1}</span>}
              </div>
              <div className={clsx('text-xs font-semibold mt-2 text-center',
                isDone ? 'text-emerald-600' : isActive ? 'text-brand-700' : 'text-slate-400')}>
                {step.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload Zone */}
      <Card>
        <div {...getRootProps()} className={clsx(
          'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all',
          isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/30',
          uploadMutation.isPending && 'pointer-events-none opacity-60'
        )}>
          <input {...getInputProps()} />
          <div className="text-4xl mb-3">📄</div>
          <div className="text-base font-semibold text-slate-700 mb-1">
            {isDragActive ? 'Drop the PDF here' : 'Drop BIT Mesra timetable PDF here'}
          </div>
          <div className="text-sm text-slate-400 mb-5">
            Any department: CSE, ECE, ME, CE… · Generic parser · Max 10 MB
          </div>
          <Button loading={uploadMutation.isPending} icon={<Upload className="w-3.5 h-3.5" />}>
            {uploadMutation.isPending ? 'Uploading…' : 'Choose PDF'}
          </Button>
        </div>

        {/* Parser Architecture Note */}
        <div className="mt-5 bg-slate-50 rounded-xl p-4 border border-surface-border">
          <div className="text-xs font-bold text-slate-600 mb-2">Parser Pipeline (pdfParser.ts)</div>
          <div className="font-mono text-[11px] text-slate-500 space-y-0.5 leading-relaxed">
            {[
              '1. Extract text items + XY positions via pdfjs-dist',
              '2. Group rows by Y-coordinate bucketing (8pt tolerance)',
              '3. Auto-detect metadata: Dept, Branch, Semester',
              '4. Build column-X → Period map from header row',
              '5. Tokenize cells → (course_abbr, room_code) pairs',
              '6. Resolve courses: exact match + Levenshtein ≤ 3',
              '7. Resolve rooms: create if new; split composite "X/Y"',
              '8. Upsert TimetableSlots with conflict detection',
              '9. Enqueue analytics-recompute → live WS broadcast',
            ].map(s => <div key={s}>{s}</div>)}
          </div>
        </div>
      </Card>

      {/* Job Status Card */}
      {job && (
        <Card className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-bold text-slate-700">
                Processing: {job.filename ?? 'uploaded file'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 font-mono">Job {job.id}</div>
            </div>
            <Badge
              color={done ? 'green' : failed ? 'red' : 'amber'}
              dot
            >
              {job.status}
            </Badge>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            {[
              { label: 'Entities Created', value: job.createdRows, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Matched Existing', value: job.matchedRows, color: 'text-brand-700',   bg: 'bg-brand-50' },
              { label: 'Rows Failed',       value: job.failedRows,  color: 'text-red-600',    bg: 'bg-red-50' },
            ].map(s => (
              <div key={s.label} className={clsx('rounded-xl p-4 text-center', s.bg)}>
                <div className={clsx('text-2xl font-bold', s.color)}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Error Log */}
          {(job.errorLog?.length ?? 0) > 0 && (
            <div>
              <div className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Parsing Warnings / Errors ({job.errorLog!.length})
              </div>
              <div className="bg-slate-900 rounded-xl p-4 space-y-1.5 max-h-48 overflow-y-auto">
                {job.errorLog!.map((e, i) => (
                  <div key={i} className="font-mono text-[11px] text-slate-300 flex gap-3">
                    <span className="text-slate-500 flex-shrink-0">{e.context ?? ('row ' + (e.row ?? i + 1))}</span>
                    <span>{e.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {done && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Ingestion complete. Dashboard analytics have been automatically recalculated.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
