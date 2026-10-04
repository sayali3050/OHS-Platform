import { useState } from "react";
import { useT } from "@/i18n";
import type { AdminDashboard } from "@/types/people";

type Point = AdminDashboard["trend"][number];

/** Incidents and hazards per month as grouped bars: one axis, two validated series colours, legend, hover tooltip,
 * and the same numbers as a table for screen readers. */
export function TrendChart({ data }: { data: Point[] }) {
  const { t, locale } = useT();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => [d.incidents, d.hazards]));
  const ticks = [0, Math.ceil(max / 2), max];
  const month = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(locale, { month: "short" });
  const H = 160;

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm text-muted" aria-hidden>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: "var(--series-1)" }} />{t("ov.incidents")}</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: "var(--series-2)" }} />{t("ov.hazards")}</span>
      </div>
      <div className="relative flex gap-2" aria-hidden>
        <div className="flex w-6 flex-col justify-between text-right text-xs tabular-nums text-muted" style={{ height: H }}>
          {[...ticks].reverse().map((v) => <span key={v} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{v}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: H }}>
            {ticks.map((v) => <div key={v} className="border-t border-line/70" />)}
          </div>
          <div className="relative grid gap-1" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map((d, i) => (
              <div key={d.month} className="relative flex flex-col items-center"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className={`flex w-full items-end justify-center gap-[2px] rounded-sm px-1 ${hover === i ? "bg-sunken/70" : ""}`} style={{ height: H }}>
                  {([["incidents", "var(--series-1)"], ["hazards", "var(--series-2)"]] as const).map(([k, color]) => (
                    <div key={k} className="w-full max-w-[22px] rounded-t-[4px]"
                      style={{ height: `${(d[k] / max) * 100}%`, minHeight: d[k] ? 2 : 0, background: color }} />
                  ))}
                </div>
                <span className="mt-1.5 text-xs text-muted">{month(d.month)}</span>
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 w-max rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-panel">
                    <p className="font-semibold">{month(d.month)} {d.month.slice(0, 4)}</p>
                    <p>{t("ov.incidents")}: <span className="font-semibold tabular-nums">{d.incidents}</span></p>
                    <p>{t("ov.hazards")}: <span className="font-semibold tabular-nums">{d.hazards}</span></p>
                    <p className="text-muted">{t("ov.injuries")}: <span className="tabular-nums">{d.injuries}</span></p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{t("ov.trend")}</caption>
        <thead><tr><th>{t("ov.month")}</th><th>{t("ov.incidents")}</th><th>{t("ov.hazards")}</th><th>{t("ov.injuries")}</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.month}><td>{d.month}</td><td>{d.incidents}</td><td>{d.hazards}</td><td>{d.injuries}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
