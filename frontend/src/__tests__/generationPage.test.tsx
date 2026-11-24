import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, signIn } from './helpers';

const posted: { url: string; body: any }[] = [];
const g = (id: number, over: object) => ({ id, semesterId: 1, version: id, name: null, source: 'GENERATED', status: 'COMPLETED', solveStatus: 'COMPLETE', publishStatus: 'DRAFT', sectionIds: [1], progress: 100, progressMessage: null, score: 88, totalSessions: 10, assignedSessions: 10, errorMessage: null, durationMs: 1200, createdAt: '', completedAt: '', publishedAt: null, ...over });
vi.mock('../lib/api', () => ({
  api: {
    get: async (url: string) => {
      if (url === '/semesters') return { data: { items: [{ id: 1, academicYearId: 1, name: 'Odd', startDate: '', endDate: '', workingDays: [], academicYear: { label: '2026-27' } }] } };
      if (url === '/sections') return { data: { items: [{ id: 11, programId: 1, semesterId: 1, yearOfStudy: 2, name: 'A', strength: 60, program: { code: 'BTECH', departmentId: 1 }, batches: [], _count: { requirements: 5 } }, { id: 12, programId: 1, semesterId: 1, yearOfStudy: 2, name: 'B', strength: 60, program: { code: 'BTECH', departmentId: 1 }, batches: [], _count: { requirements: 5 } }] } };
      if (url === '/generations') return { data: { items: [g(3, { status: 'RUNNING', solveStatus: null, progress: 42, progressMessage: 'search: 12/30 sessions placed', totalSessions: null, assignedSessions: null }), g(2, { status: 'FAILED', solveStatus: null, errorMessage: 'The selected sections have no subject requirements', progress: 0 }), g(1, { publishStatus: 'PUBLISHED' })] } };
      throw new Error('unmocked ' + url);
    },
    post: async (url: string, body: unknown) => { posted.push({ url, body }); return { data: { id: 9 } }; },
  },
  onWsMessage: () => () => {},
}));
import GenerationPage from '../components/pages/GenerationPage';

describe('GenerationPage', () => {
  it('shows live progress for running jobs, failures, and result summaries for finished ones', async () => {
    signIn('HOD'); renderAt(<GenerationPage />);
    const running = await screen.findByTestId('gen-3');
    expect(running).toHaveTextContent('RUNNING');
    expect(running).toHaveTextContent('search: 12/30 sessions placed');
    expect(running.querySelector('[style*="42%"]')).not.toBeNull();
    expect(screen.getByTestId('gen-2')).toHaveTextContent('no subject requirements');
    expect(screen.getByTestId('gen-1')).toHaveTextContent('10/10 sessions');
    expect(screen.getByTestId('gen-1')).toHaveTextContent('PUBLISHED');
    // published generations cannot be deleted from the list; running ones can be cancelled
    expect(screen.queryByLabelText('Delete v1')).toBeNull();
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
  });

  it('requires at least one section and posts the chosen sections and options', async () => {
    signIn('HOD'); renderAt(<GenerationPage />);
    const btn = await screen.findByRole('button', { name: /^Generate/ });
    expect(btn).toBeDisabled();
    await userEvent.click(await screen.findByLabelText(/BTECH-2A/));
    await userEvent.click(screen.getByRole('button', { name: /^Generate \(1\)/ }));
    await vi.waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].url).toBe('/generations');
    expect(posted[0].body).toMatchObject({ semesterId: 1, sectionIds: [11], config: { timeLimitMs: 30000 } });
  });

  it('disables generation for roles below HOD', async () => {
    signIn('COORDINATOR'); renderAt(<GenerationPage />);
    await userEvent.click(await screen.findByLabelText(/BTECH-2A/));
    expect(screen.getByRole('button', { name: /^Generate/ })).toBeDisabled();
    expect(screen.getByText(/Only HODs and above/)).toBeInTheDocument();
  });
});
