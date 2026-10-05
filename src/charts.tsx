// ============================================================
// charts.tsx — Lightweight, dependency-free charts
// ============================================================
// Single-series, single-hue (brass) marks: magnitude only, so no
// categorical palette is needed. Thin bars with 4px rounded data-ends
// anchored to the baseline, 2px gaps, recessive gridlines, a hover/tap
// tooltip on every mark, and a screen-reader table for each chart.
// ============================================================

import { ReactNode, useState } from 'react';
import { cx } from './ui';

export interface BarDatum {
  key: string;
  label: string;      // x-axis label
  value: number;
  tooltip: string;    // first line, e.g. "Tue, Oct 6"
  detail?: string;    // second line, e.g. "3 appointments"
}

/** Round the axis maximum up to a friendly number (1, 2, 2.5, 5 × 10^n) */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function BarChart({
  data,
  format,
  height = 168,
  emptyText = 'No data for this period yet',
  title,
  integer = false,
}: {
  data: BarDatum[];
  format: (v: number) => string;
  height?: number;
  emptyText?: string;
  title: string; // used for the accessible table caption
  integer?: boolean; // counts: keep gridlines on whole numbers
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));

  if (max === 0) {
    return (
      <div style={{ height }} className="grid place-items-center rounded-2xl border border-dashed border-white/[0.07] text-sm text-ink-500">
        {emptyText}
      </div>
    );
  }

  const top = integer ? Math.max(2, 2 * Math.ceil(niceMax(max) / 2)) : niceMax(max);
  const n = data.length;
  const labelEvery = Math.ceil(n / 8);
  const a = active !== null ? data[active] : null;
  const align = active === null ? '' : active < n * 0.2 ? 'translate-x-0' : active > n * 0.8 ? '-translate-x-full' : '-translate-x-1/2';

  return (
    <div>
      <div className="relative" style={{ height }} onMouseLeave={() => setActive(null)}>
        {/* Gridlines + axis values (recessive) */}
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${f * 100}%` }}>
            <div className={cx('h-px flex-1', f === 0 ? 'bg-white/[0.12]' : 'bg-white/[0.05]')} />
            <span className="tnum w-12 -translate-y-px text-right text-[10px] text-ink-500">{f === 0 ? '' : format(top * f)}</span>
          </div>
        ))}

        {/* Bars */}
        <div className="absolute inset-y-0 left-0 right-14 flex items-end gap-[2px]">
          {data.map((d, i) => {
            const h = d.value > 0 ? Math.max(2, (d.value / top) * 100) : 0;
            const isActive = active === i;
            return (
              <button
                key={d.key}
                type="button"
                aria-label={`${d.tooltip}: ${format(d.value)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(isActive ? null : i)}
                className="flex h-full min-w-0 flex-1 items-end justify-center outline-none"
              >
                <span
                  className={cx(
                    'block w-full max-w-[26px] rounded-t-[4px] transition-colors duration-150',
                    active === null ? 'bg-gold-400' : isActive ? 'bg-gold-200' : 'bg-gold-500/45'
                  )}
                  style={{ height: `${h}%` }}
                />
              </button>
            );
          })}
        </div>

        {/* Tooltip */}
        {a && active !== null && (
          <div
            className={cx('pointer-events-none absolute -top-2 z-10 -translate-y-full', align)}
            style={{ left: `calc((100% - 56px) * ${(active + 0.5) / n})` }}
          >
            <div className="whitespace-nowrap rounded-xl border border-white/10 bg-ink-800/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
              <div className="text-ink-400">{a.tooltip}</div>
              <div className="tnum mt-0.5 font-semibold text-cream">{format(a.value)}</div>
              {a.detail && <div className="mt-0.5 text-ink-400">{a.detail}</div>}
            </div>
          </div>
        )}
      </div>

      {/* X labels */}
      <div className="mr-14 mt-2 flex gap-[2px]">
        {data.map((d, i) => (
          <span key={d.key} className="tnum min-w-0 flex-1 truncate text-center text-[10px] text-ink-500">
            {i % labelEvery === 0 ? d.label : ''}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.tooltip}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface RankRow {
  key: string;
  label: ReactNode;
  value: number;
  display: string;
  sub?: string;
  lead?: ReactNode;
}

/** Ranked horizontal bars (barbers, services, clients…) */
export function RankList({ rows, emptyText = 'Nothing here yet' }: { rows: RankRow[]; emptyText?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0 || max === 0) return <p className="py-6 text-center text-sm text-ink-500">{emptyText}</p>;
  return (
    <ul className="divide-y divide-white/[0.05]">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 py-3">
          {r.lead}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-cream">{r.label}</span>
              <span className="tnum shrink-0 text-sm font-medium text-cream">{r.display}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full bg-gold-400" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </div>
            {r.sub && <p className="mt-1 text-[11px] text-ink-400">{r.sub}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
