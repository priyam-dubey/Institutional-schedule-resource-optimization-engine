import { dayShort, type Day } from '../../lib/scheduling';

export type Mark = 'UNAVAILABLE' | 'PREFERRED';
export interface GridPeriod { index: number; label: string; isBreak: boolean }

/** Click a cell to cycle: free -> unavailable -> (preferred) -> free. Keys are `${day}|${periodIndex}`. */
export default function AvailabilityGrid({ days, periods, value, onChange, allowPreferred, disabled }: {
  days: Day[]; periods: GridPeriod[]; value: Record<string, Mark>; onChange: (v: Record<string, Mark>) => void; allowPreferred?: boolean; disabled?: boolean;
}) {
  const next = (cur?: Mark): Mark | undefined => (cur === undefined ? 'UNAVAILABLE' : cur === 'UNAVAILABLE' && allowPreferred ? 'PREFERRED' : undefined);
  const cycle = (k: string) => {
    const n = next(value[k]);
    const copy = { ...value };
    if (n) copy[k] = n; else delete copy[k];
    onChange(copy);
  };
  return (
    <div>
      <table className="text-xs border-collapse" aria-label="Availability grid">
        <thead><tr><th />{periods.filter((p) => !p.isBreak).map((p) => <th key={p.index} className="px-2 py-1 text-slate-500">{p.label}</th>)}</tr></thead>
        <tbody>{days.map((d) => (
          <tr key={d}><th className="pr-2 text-left text-slate-500">{dayShort(d)}</th>
            {periods.filter((p) => !p.isBreak).map((p) => {
              const k = `${d}|${p.index}`; const m = value[k];
              return (
                <td key={k} className="p-0.5">
                  <button type="button" disabled={disabled} aria-label={`${d} ${p.label}: ${m ?? 'available'}`} data-state={m ?? 'FREE'} onClick={() => cycle(k)}
                    className={`w-10 h-8 rounded-lg border text-[10px] font-semibold ${m === 'UNAVAILABLE' ? 'bg-red-100 border-red-300 text-red-700' : m === 'PREFERRED' ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-surface-border text-slate-300 hover:bg-slate-50'}`}>
                    {m === 'UNAVAILABLE' ? '✕' : m === 'PREFERRED' ? '★' : '·'}
                  </button>
                </td>);
            })}</tr>))}</tbody>
      </table>
      <p className="text-[11px] text-slate-400 mt-2">{allowPreferred ? '✕ unavailable (hard) · ★ preferred (soft) · click to cycle' : '✕ unavailable · click to toggle'}</p>
    </div>
  );
}

export const toKeyMap = (items: { day: Day; periodIndex: number; kind?: Mark }[], fallback: Mark = 'UNAVAILABLE') =>
  Object.fromEntries(items.map((i) => [`${i.day}|${i.periodIndex}`, i.kind ?? fallback])) as Record<string, Mark>;
export const fromKeyMap = (m: Record<string, Mark>) =>
  Object.entries(m).map(([k, kind]) => { const [day, p] = k.split('|'); return { day, periodIndex: Number(p), kind }; });
