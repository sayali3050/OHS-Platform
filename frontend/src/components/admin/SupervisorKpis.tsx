import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Panel, Skeleton } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { statusKey } from "@/i18n/labels";
import { api } from "@/services/api";
import type { SupervisorDashboard } from "@/types/people";
import { INCIDENT_FLOW } from "@/types/reports";
import { cn } from "@/utils/cn";

/** What's waiting and what's late in the supervisor's department. Each tile links to the list behind it. */
export function SupervisorKpis() {
  const { t } = useT();
  const [d, setD] = useState<SupervisorDashboard | null>(null);
  useEffect(() => { api.dashboard.supervisor().then(setD).catch(() => {}); }, []);
  if (!d) return <Skeleton className="h-48" />;

  const tiles: { label: string; value: string | number; to?: string; alert?: boolean }[] = [
    { label: t("sup.unassigned"), value: d.unassigned_over_24h, to: "/app/board", alert: d.unassigned_over_24h > 0 },
    { label: t("sup.overdue"), value: d.actions_overdue, to: "/app/actions?scope=team&state=overdue", alert: d.actions_overdue > 0 },
    { label: t("sup.due7"), value: d.actions_due_7d, to: "/app/actions?scope=team" },
    { label: t("sup.mine"), value: d.my_open_actions, to: "/app/actions" },
    { label: t("sup.closed30"), value: d.closed_30d },
    { label: t("sup.avgClose"), value: d.avg_days_to_close ?? "—" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((x) => {
          const body = (<><p className="text-sm text-muted">{x.label}</p><p className="mt-1 font-display text-3xl font-bold tabular-nums">{x.value}</p></>);
          const cls = cn("block rounded-lg border bg-surface p-4", x.alert ? "border-l-4 border-line border-l-danger" : "border-line",
            x.to && "transition-colors hover:bg-sunken/50");
          return x.to ? <Link key={x.label} to={x.to} className={cls}>{body}</Link> : <div key={x.label} className={cls}>{body}</div>;
        })}
      </div>
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{t("sup.pipeline")}</h2>
          <Link to="/app/board" className="text-[15px] font-semibold text-info hover:underline">{t("nav.board")}</Link>
        </div>
        <ol className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {INCIDENT_FLOW.map((s) => (
            <li key={s} className="rounded-md bg-sunken/60 p-2 text-center">
              <p className="font-display text-2xl font-bold tabular-nums">{d.incidents_by_status[s] ?? 0}</p>
              <p className="text-xs text-muted">{t(statusKey(s, "incident"))}</p>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
