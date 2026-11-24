import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { httpError, renderAt, signIn } from './helpers';

const calls: { method: string; url: string; body?: unknown }[] = [];
const handlers: Record<string, (body?: unknown) => unknown> = {};
vi.mock('../lib/api', () => {
  const run = (method: string) => async (url: string, a?: unknown, b?: unknown) => {
    const body = method === 'get' || method === 'delete' ? undefined : a;
    calls.push({ method, url, body });
    const key = Object.keys(handlers).find((k) => k === `${method.toUpperCase()} ${url}` || (k.endsWith('*') && `${method.toUpperCase()} ${url}`.startsWith(k.slice(0, -1))));
    if (!key) throw httpError(404, { error: `unmocked ${method} ${url}` });
    const out = handlers[key](body);
    if (out instanceof Error) throw out;
    return { data: out };
    void b;
  };
  return { api: { get: run('get'), post: run('post'), patch: run('patch'), put: run('put'), delete: run('delete') }, onWsMessage: () => () => {}, connectWebSocket: () => {}, disconnectWebSocket: () => {} };
});

import TimetableViewerPage from '../components/pages/TimetableViewerPage';

const gen = (over = {}) => ({ id: 5, semesterId: 1, version: 2, name: 'A+B', source: 'GENERATED', status: 'COMPLETED', solveStatus: 'COMPLETE', publishStatus: 'DRAFT', sectionIds: [1], progress: 100, progressMessage: null, score: 90, totalSessions: 2, assignedSessions: 2, errorMessage: null, durationMs: 10, createdAt: '', completedAt: '', publishedAt: null, ...over });
const entry = (id: number, over = {}) => ({ id, requirementId: id, sessionIndex: 0, day: 'MONDAY', startPeriod: 0, length: 1, sectionId: 1, section: 'BTECH-2A', batchId: null, batch: null, subjectId: id, subjectCode: `CS20${id}`, subjectName: `Subject ${id}`, subjectType: 'LECTURE', facultyProfileId: 7, facultyName: 'Prof Rao', roomId: 3, roomNumber: 'C100', roomType: 'CLASSROOM', ...over });
const view = () => ({
  generation: gen(), days: ['MONDAY', 'TUESDAY'],
  periods: [{ position: 0, index: 0, label: 'I', startTime: '09:00', endTime: '09:50', isBreak: false }, { position: 1, index: 1, label: 'Break', startTime: '09:50', endTime: '10:10', isBreak: true }, { position: 2, index: 2, label: 'II', startTime: '10:10', endTime: '11:00', isBreak: false }],
  entries: [entry(1), entry(2, { day: 'TUESDAY', startPeriod: 2, facultyName: 'Prof Rao' })],
});

function setup(role: 'HOD' | 'DEAN' | 'PROFESSOR', g = gen()) {
  signIn(role);
  calls.length = 0;
  for (const k of Object.keys(handlers)) delete handlers[k];
  handlers['GET /generations/5'] = () => g;
  handlers['GET /generations/5/entries'] = () => ({ ...view(), generation: g });
  handlers['GET /generations/5/conflicts'] = () => ({ items: [] });
  handlers['GET /faculty-profiles'] = () => ({ items: [{ id: 7, userId: 7, designation: null, maxPeriodsPerWeek: 20, maxConsecutive: 3, user: { id: 7, name: 'Prof Rao', email: 'r@x', departmentId: 1 }, qualifications: [] }], usersWithoutProfile: [] });
  handlers['GET /rooms'] = () => ({ data: [{ id: 3, roomNumber: 'C100', type: 'CLASSROOM', capacity: 60 }] });
}
const open = () => renderAt(<TimetableViewerPage />, '/timetables/5', '/timetables/:id');

beforeEach(() => vi.clearAllMocks());

describe('TimetableViewerPage', () => {
  it('renders entries in the right day/period cells and shades breaks', async () => {
    setup('HOD'); open();
    const mon = await screen.findByText('CS201');
    expect(mon.closest('td')).toHaveAttribute('data-cell', 'MONDAY|0');
    expect(screen.getByText('CS202').closest('td')).toHaveAttribute('data-cell', 'TUESDAY|2');
    expect(screen.getAllByText('break').length).toBe(2);
  });

  it('shows the API conflict list and does not close when an edit is rejected, then can apply anyway', async () => {
    setup('HOD');
    let n = 0;
    handlers['PATCH /generations/5/entries/1'] = (body) => {
      n++;
      const b = body as { allowConflicts?: boolean };
      if (b.allowConflicts) return { entry: {}, report: { valid: false } };
      return httpError(409, { error: 'conflict', code: 'CONFLICT', details: { valid: false, complete: true, totalViolations: 1, violations: [{ type: 'FACULTY_CONFLICT', message: 'Faculty f7 double-booked' }] } });
    };
    open();
    await userEvent.click(await screen.findByText('CS201'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/would create 1 conflict/)).toBeInTheDocument();
    expect(within(alert).getByText(/Faculty f7 double-booked/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Apply anyway/ }));
    await waitFor(() => expect(n).toBe(2));
    expect(calls.filter((c) => c.method === 'patch').map((c) => (c.body as { allowConflicts: boolean }).allowConflicts)).toEqual([false, true]);
  });

  it('hides publish for HODs, shows it for deans, and routes an INCOMPLETE rejection through a confirmation', async () => {
    setup('HOD'); const hod = open();
    await screen.findByText('CS201');
    expect(screen.queryByRole('button', { name: /^Publish$/ })).toBeNull();
    hod.unmount();

    setup('DEAN');
    handlers['POST /generations/5/publish'] = (body) => ((body as { allowPartial?: boolean }).allowPartial
      ? { generation: gen({ publishStatus: 'PUBLISHED' }), complete: false }
      : httpError(409, { error: 'The timetable is incomplete', code: 'INCOMPLETE' }));
    open();
    await userEvent.click(await screen.findByRole('button', { name: /^Publish$/ }));
    expect(await screen.findByText('Publish an incomplete timetable?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish anyway' }));
    await waitFor(() => expect(calls.filter((c) => c.url === '/generations/5/publish')).toHaveLength(2));
    expect((calls.filter((c) => c.url === '/generations/5/publish')[1].body as { allowPartial: boolean }).allowPartial).toBe(true);
  });

  it('shows hard violations when publishing is blocked by validation', async () => {
    setup('DEAN');
    handlers['POST /generations/5/publish'] = () => httpError(409, { error: 'x', code: 'VALIDATION_FAILED', details: { valid: false, complete: true, totalViolations: 1, violations: [{ type: 'ROOM_CONFLICT', message: 'Room m3 double-booked' }] } });
    open();
    await userEvent.click(await screen.findByRole('button', { name: /^Publish$/ }));
    expect(await screen.findByText('Room m3 double-booked')).toBeInTheDocument();
  });

  it('published timetables are read-only (entries are not editable) and offer unpublish/clone', async () => {
    setup('DEAN', gen({ publishStatus: 'PUBLISHED' })); open();
    const btn = await screen.findByText('CS201');
    expect(btn.closest('button')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Unpublish/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clone as new version/ })).toBeInTheDocument();
  });
});
