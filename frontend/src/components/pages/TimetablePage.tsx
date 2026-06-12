import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader, Card, Badge, TableSkeleton, EmptyState } from '../ui';
import type { TimetableSlot, DayOfWeek, Period, CourseType } from '../../types';
import { clsx } from 'clsx';

const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const PERIODS: Period[]  = ['I', 'II', 'III', 'IV', 'V', 'VII', 'VIII', 'IX'];
const PERIOD_TIMES: Record<Period, string> = {
  I: '08:00', II: '09:00', III: '10:00', IV: '11:00', V: '12:00',
  VII: '13:30', VIII: '14:30', IX: '15:30'
};

const COURSE_COLORS: Record<CourseType, string> = {
  LECTURE: 'bg-brand-50 text-brand-700 border-brand-200',
  LAB:     'bg-purple-50 text-purple-700 border-purple-200',
  TUTORIAL:'bg-amber-50 text-amber-700 border-amber-200',
};

export default function TimetablePage() {
  const [branch, setBranch] = useState('CS');
  const [semester, setSemester] = useState('6');

  const { data, isLoading } = useQuery<{ slots: TimetableSlot[]; grid: Record<string, Record<string, TimetableSlot>> }>({
    queryKey: ['timetable', branch, semester],
    queryFn: () => api.get('/timetable', { params: { branch, semester } }).then(r => r.data),
    staleTime: 30_000,
  });

  const grid = data?.grid ?? {};

  return (
    <div>
      <PageHeader title="Timetable Grid"
        subtitle={'BIT Mesra · B.Tech · ' + branch + ' · Semester ' + semester + ' · Spring 2026'}
        actions={
          <div className="flex gap-2">
            <select className="select w-32" value={branch} onChange={e => setBranch(e.target.value)}>
              {['CS', 'AIML', 'IT'].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select className="select w-28" value={semester} onChange={e => setSemester(e.target.value)}>
              {Array.from({ length: 8 }, (_, i) => <option key={i+1} value={i+1}>Sem {i+1}</option>)}
            </select>
          </div>
        }
      />

      {/* Legend */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {(['LECTURE', 'LAB', 'TUTORIAL'] as CourseType[]).map(t => (
          <span key={t} className={clsx('text-xs font-semibold px-3 py-1 rounded-lg border', COURSE_COLORS[t])}>{t}</span>
        ))}
        <span className="text-xs font-semibold px-3 py-1 rounded-lg border bg-slate-50 text-slate-500 border-slate-200">LUNCH BREAK (12:50–13:30)</span>
      </div>

      <Card noPadding>
        {isLoading ? <div className="p-4"><TableSkeleton rows={5} cols={10} /></div>
          : (data?.slots.length ?? 0) === 0
          ? <EmptyState icon="📅" title="No timetable slots found"
              subtitle={'No slots for ' + branch + ' Sem ' + semester + '. Ingest a PDF or add slots manually.'} />
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-surface-muted">
                    <th className="w-24 px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b border-surface-border">Day</th>
                    {PERIODS.map(p => (
                      <th key={p} className="px-2 py-3 text-center text-xs font-semibold text-slate-500 border-b border-surface-border min-w-[90px]">
                        <div>{p}</div>
                        <div className="text-[10px] font-normal text-slate-400">{PERIOD_TIMES[p]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map(day => (
                    <tr key={day}>
                      <td className="px-4 py-2 font-semibold text-slate-600 bg-surface-muted border-b border-r border-surface-border text-xs">
                        {day.charAt(0) + day.slice(1).toLowerCase()}
                        {/* Lunch indicator after period V */}
                      </td>
                      {PERIODS.map(period => {
                        const slot = grid[day]?.[period];
                        return (
                          <td key={period} className="p-1 border-b border-r border-surface-border align-middle">
                            {slot ? (
                              <div className={clsx(
                                'rounded-lg border px-2 py-1.5 text-center cursor-pointer hover:opacity-80 transition-opacity',
                                COURSE_COLORS[slot.course?.type ?? 'LECTURE']
                              )}>
                                <div className="text-[11px] font-bold leading-tight">{slot.course?.code}</div>
                                <div className="text-[10px] leading-tight opacity-70 mt-0.5">
                                  {slot.room?.roomNumber}
                                </div>
                              </div>
                            ) : (
                              // Period V is followed by lunch break
                              period === 'V' ? (
                                <div className="text-center text-slate-300 text-[10px]">free</div>
                              ) : (
                                <div className="h-10 rounded-lg border border-dashed border-slate-100" />
                              )
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Card>

      {/* Course legend table */}
      {(data?.slots.length ?? 0) > 0 && (() => {
        const unique = Object.values(
          (data?.slots ?? []).reduce((acc, s) => {
            if (s.course && !acc[s.courseId]) acc[s.courseId] = s;
            return acc;
          }, {} as Record<number, TimetableSlot>)
        );
        return (
          <Card className="mt-4" noPadding>
            <div className="px-5 py-3 border-b border-surface-border">
              <div className="text-sm font-bold text-slate-700">Course Legend</div>
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Code</th><th>Course Name</th><th>Type</th><th>Credits</th><th>Faculty</th></tr></thead>
                <tbody>
                  {unique.map(s => (
                    <tr key={s.courseId}>
                      <td><code className="text-xs bg-slate-100 px-2 py-0.5 rounded-md font-mono">{s.course?.code}</code></td>
                      <td className="text-slate-700">{s.course?.name}</td>
                      <td><Badge color={s.course?.type === 'LAB' ? 'purple' : 'blue'}>{s.course?.type}</Badge></td>
                      <td className="text-slate-500">{s.course?.credits}</td>
                      <td className="text-slate-500 text-xs">{s.faculty?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })()}
    </div>
  );
}
