/** Types, query hooks and helpers for the scheduling workflow (all backed by real API calls). */
import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation, type QueryKey } from '@tanstack/react-query';
import { create } from 'zustand';
import toast from 'react-hot-toast';
import { api, onWsMessage } from './api';

export type Day = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export const ALL_DAYS: Day[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export const dayShort = (d: string) => d.slice(0, 3);

export interface Semester {
  id: number; academicYearId: number; name: string; startDate: string; endDate: string; workingDays: Day[];
  academicYear?: { label: string };
  _count?: { sections: number; periods: number; generations: number };
  periods?: Period[]; holidays?: { id: number; date: string; name: string }[];
}
export interface Period { id?: number; index: number; label: string; startTime: string; endTime: string; isBreak: boolean }
export interface Generation {
  id: number; semesterId: number; version: number; name: string | null; source: 'GENERATED' | 'IMPORTED';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  solveStatus: 'COMPLETE' | 'PARTIAL' | 'INFEASIBLE' | 'INVALID' | null;
  publishStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  sectionIds: number[]; progress: number; progressMessage: string | null; score: number | null;
  totalSessions: number | null; assignedSessions: number | null; errorMessage: string | null; durationMs: number | null;
  createdAt: string; completedAt: string | null; publishedAt: string | null;
  _count?: { entries: number; conflicts: number };
  conflictCounts?: Partial<Record<'HARD' | 'UNASSIGNED' | 'INFEASIBLE', number>>;
  stats?: { warnings?: string[] } | null;
}
export interface Conflict { id: number; kind: 'HARD' | 'UNASSIGNED' | 'INFEASIBLE'; code: string; message: string; sectionId: number | null; requirementId: number | null }
export interface Section {
  id: number; programId: number; semesterId: number; yearOfStudy: number; name: string; strength: number;
  program: { code: string; departmentId: number }; batches: { id: number; name: string; strength: number }[]; _count?: { requirements: number };
}
export interface Entry {
  id: number; requirementId: number | null; sessionIndex: number; day: Day; startPeriod: number; length: number;
  sectionId: number; section: string; batchId: number | null; batch: string | null;
  subjectId: number; subjectCode: string; subjectName: string; subjectType: string;
  facultyProfileId: number; facultyName: string; roomId: number; roomNumber: string; roomType: string;
}
export interface TimetableView {
  generation: Generation; days: Day[];
  periods: { position: number; index: number; label: string; startTime: string; endTime: string; isBreak: boolean }[];
  entries: Entry[];
}
export interface ValidationReport {
  valid: boolean; complete: boolean; totalViolations: number;
  violations: { type: string; message: string; sectionId?: number; day?: Day; period?: number }[];
}

export function errMsg(e: unknown): string {
  const r = (e as { response?: { data?: { error?: string; details?: unknown; message?: string } } })?.response?.data;
  if (r?.error) return r.error;
  return (e as Error)?.message ?? 'Something went wrong';
}
export const errData = (e: unknown) => (e as { response?: { data?: any; status?: number } })?.response;

// ── selected semester (persisted per browser) ───────────────────────────────
interface SemState { semesterId: number | null; set: (id: number | null) => void }
export const useSemesterStore = create<SemState>((set) => ({
  semesterId: (() => { try { const v = localStorage.getItem('samayak_semester'); return v ? Number(v) : null; } catch { return null; } })(),
  set: (id) => { try { id ? localStorage.setItem('samayak_semester', String(id)) : localStorage.removeItem('samayak_semester'); } catch { /* storage unavailable */ } set({ semesterId: id }); },
}));

export function useSemesters() {
  return useQuery<Semester[]>({ queryKey: ['semesters'], queryFn: () => api.get('/semesters').then((r) => r.data.items) });
}

/** The selected semester, defaulting to the first available one. */
export function useCurrentSemester() {
  const { data: semesters = [], isLoading } = useSemesters();
  const { semesterId, set } = useSemesterStore();
  const current = semesters.find((s) => s.id === semesterId) ?? semesters[0] ?? null;
  useEffect(() => { if (current && current.id !== semesterId) set(current.id); }, [current, semesterId, set]);
  return { semesters, current, isLoading, select: set };
}

export function useSections(semesterId?: number | null) {
  return useQuery<Section[]>({
    queryKey: ['sections', semesterId], enabled: !!semesterId,
    queryFn: () => api.get('/sections', { params: { semesterId } }).then((r) => r.data.items),
  });
}

export function useGenerations(semesterId?: number | null) {
  return useQuery<Generation[]>({
    queryKey: ['generations', semesterId], enabled: !!semesterId,
    queryFn: () => api.get('/generations', { params: { semesterId } }).then((r) => r.data.items),
    refetchInterval: (q) => (q.state.data?.some((g) => g.status === 'QUEUED' || g.status === 'RUNNING') ? 2000 : false),
  });
}

export function useGeneration(id?: number | null) {
  return useQuery<Generation>({
    queryKey: ['generation', id], enabled: !!id,
    queryFn: () => api.get(`/generations/${id}`).then((r) => r.data),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'QUEUED' || q.state.data.status === 'RUNNING') ? 1500 : false),
  });
}

export function useTimetable(id?: number | null, filters: Record<string, string | number | undefined> = {}) {
  return useQuery<TimetableView>({
    queryKey: ['timetable', id, filters], enabled: !!id,
    queryFn: () => api.get(`/generations/${id}/entries`, { params: filters }).then((r) => r.data),
  });
}

/** Refreshes generation/timetable/analytics caches when the server pushes a relevant WebSocket event. */
export function useScheduleLiveUpdates() {
  const qc = useQueryClient();
  useEffect(() => onWsMessage((m) => {
    const t = String(m?.type ?? '');
    if (t.startsWith('generation.') || t.startsWith('timetable.')) {
      qc.invalidateQueries({ queryKey: ['generations'] });
      qc.invalidateQueries({ queryKey: ['schedule-analytics'] });
      if (m.generationId) {
        qc.invalidateQueries({ queryKey: ['generation', m.generationId] });
        qc.invalidateQueries({ queryKey: ['timetable', m.generationId] });
        qc.invalidateQueries({ queryKey: ['conflicts', m.generationId] });
      }
    }
    if (t.startsWith('ingestion.')) qc.invalidateQueries({ queryKey: ['ingestion'] });
  }), [qc]);
}

export function useApiMutation<TVars, TRes = unknown>(
  fn: (v: TVars) => Promise<TRes>,
  opts: { invalidate?: QueryKey[]; success?: string; onSuccess?: (r: TRes) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

export const statusColor = (s: string): 'green' | 'amber' | 'red' | 'blue' | 'slate' =>
  ({ COMPLETED: 'green', COMPLETE: 'green', PUBLISHED: 'green', RUNNING: 'blue', QUEUED: 'slate', PARTIAL: 'amber', DRAFT: 'slate', INFEASIBLE: 'red', INVALID: 'red', FAILED: 'red', CANCELLED: 'slate', ARCHIVED: 'slate' } as const)[s as 'DRAFT'] ?? 'slate';

export interface Dept { id: number; code: string; name: string }
export function useDepartments() {
  return useQuery<Dept[]>({ queryKey: ['departments-all'], queryFn: () => api.get('/departments', { params: { limit: 100 } }).then((r) => r.data.data) });
}
export interface Subject { id: number; departmentId: number; code: string; name: string; credits: string | number; type: 'LECTURE' | 'LAB' | 'TUTORIAL'; defaultSessionsPerWeek: number; defaultBlockLength: number; requiredRoomType: 'CLASSROOM' | 'LAB' | 'OTHER'; requiredEquipment: string[]; department?: { code: string } }
export function useSubjects(departmentId?: number | null) {
  return useQuery<Subject[]>({ queryKey: ['subjects', departmentId ?? 'all'], queryFn: () => api.get('/subjects', { params: { departmentId: departmentId || undefined } }).then((r) => r.data.items) });
}
export interface Program { id: number; departmentId: number; code: string; name: string; level: string | null; durationYears: number; department?: { code: string }; _count?: { sections: number } }
export function usePrograms() {
  return useQuery<Program[]>({ queryKey: ['programs'], queryFn: () => api.get('/programs').then((r) => r.data.items) });
}
export interface FacultyProfile { id: number; userId: number; designation: string | null; maxPeriodsPerWeek: number; maxConsecutive: number; user: { id: number; name: string; email: string; departmentId: number }; qualifications: { subjectId: number }[] }
export function useFacultyProfiles() {
  return useQuery<{ items: FacultyProfile[]; usersWithoutProfile: { id: number; name: string; email: string; departmentId: number }[] }>({ queryKey: ['faculty-profiles'], queryFn: () => api.get('/faculty-profiles').then((r) => r.data) });
}
