import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { StatusBadge, Modal } from './index';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface BulkImportProps {
  endpoint: string; // e.g. /departments/import/csv
  entity: string;   // "departments", "rooms", etc.
  templateColumns: string[];
  onSuccess?: () => void;
}

export function BulkImportButton({ endpoint, entity, templateColumns, onSuccess }: BulkImportProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <Upload size={14} />
        Import CSV
      </button>
      <BulkImportModal
        open={open}
        onClose={() => setOpen(false)}
        endpoint={endpoint}
        entity={entity}
        templateColumns={templateColumns}
        onSuccess={() => { setOpen(false); onSuccess?.(); }}
      />
    </>
  );
}

function BulkImportModal({ open, onClose, endpoint, entity, templateColumns, onSuccess }: BulkImportProps & {
  open: boolean; onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<'skip' | 'merge'>('skip');
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();

  // Poll job status
  const { data: jobStatus } = useQuery({
    queryKey: ['import-job', jobId],
    queryFn: async () => {
      const res = await api.get(`/timetable/jobs/${jobId}`);
      return res.data;
    },
    enabled: !!jobId,
    refetchInterval: (data) => {
      if (!data || ['DONE', 'FAILED'].includes(data.status)) return false;
      return 1500;
    },
  });

  const onDrop = useCallback((files: File[]) => {
    setFile(files[0] || null);
    setJobId(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    maxFiles: 1,
  });

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('duplicateStrategy', strategy);
      const res = await api.post(endpoint, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setJobId(res.data.jobId);
      toast.success('File uploaded — processing started');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleClose() {
    if (jobStatus?.status === 'DONE') {
      qc.invalidateQueries({ queryKey: [entity] });
      onSuccess?.();
    }
    setFile(null);
    setJobId(null);
    onClose();
  }

  const summary = jobStatus?.summary;

  return (
    <Modal open={open} onClose={handleClose} title={`Import ${entity} from CSV / Excel`} size="lg">
      <div className="space-y-4">
        {/* Template hint */}
        <div className="bg-brand-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-brand-700 mb-1">Expected columns:</p>
          <p className="text-xs text-brand-600 font-mono">{templateColumns.join(', ')}</p>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-brand-500 bg-brand-50' : 'border-surface-border hover:border-brand-300 hover:bg-brand-50/30'}`}
        >
          <input {...getInputProps()} />
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileText size={20} className="text-brand-600" />
              <span className="text-sm font-medium text-slate-700">{file.name}</span>
              <span className="text-xs text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <div>
              <Upload size={24} className="text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600 font-medium">Drop a CSV or Excel file here</p>
              <p className="text-xs text-slate-400 mt-1">or click to browse</p>
            </div>
          )}
        </div>

        {/* Strategy */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-slate-600">On duplicate:</span>
          {(['skip', 'merge'] as const).map(s => (
            <label key={s} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="strategy"
                value={s}
                checked={strategy === s}
                onChange={() => setStrategy(s)}
                className="accent-brand-600"
              />
              <span className="text-xs text-slate-700 capitalize">{s}</span>
            </label>
          ))}
        </div>

        {/* Job status */}
        {jobId && jobStatus && (
          <div className="border border-surface-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Processing status</span>
              <StatusBadge status={jobStatus.status} />
            </div>

            {['PARSING', 'INTEGRATING'].includes(jobStatus.status) && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 size={13} className="animate-spin text-brand-600" />
                {jobStatus.status === 'PARSING' ? 'Parsing file rows...' : 'Integrating into database...'}
              </div>
            )}

            {jobStatus.status === 'DONE' && summary && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
                  <CheckCircle2 size={15} className="text-emerald-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-emerald-700">{summary.created}</p>
                  <p className="text-xs text-emerald-600">Created</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                  <AlertCircle size={15} className="text-amber-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-amber-700">{summary.matched}</p>
                  <p className="text-xs text-amber-600">Matched</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2.5 text-center">
                  <XCircle size={15} className="text-red-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-red-600">{summary.failed}</p>
                  <p className="text-xs text-red-500">Failed</p>
                </div>
              </div>
            )}

            {jobStatus.status === 'FAILED' && summary?.error && (
              <div className="bg-red-50 rounded-lg p-3 text-xs text-red-700">{summary.error}</div>
            )}

            {summary?.errors?.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1">
                {summary.errors.slice(0, 20).map((e: string, i: number) => (
                  <p key={i} className="text-xs text-red-600 font-mono bg-red-50 px-2 py-1 rounded">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <button className="btn-secondary" onClick={handleClose}>
            {jobStatus?.status === 'DONE' ? 'Done' : 'Cancel'}
          </button>
          {!jobId && (
            <button
              className="btn-primary"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Upload & Process
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
