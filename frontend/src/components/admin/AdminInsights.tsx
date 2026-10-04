import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bot, Database, HeartPulse, ShieldAlert, Siren } from "lucide-react";
import { Badge, Panel } from "@/components/ui/misc";
import { TrendChart } from "@/components/admin/TrendChart";
import { RiskBadge } from "@/pages/app/DepartmentsPage";
import { useT, type MessageKey } from "@/i18n";
import { hazardCategoryKey, severityKey } from "@/i18n/labels";
import type { AdminDashboard } from "@/types/people";
import type { HazardCategory, Severity } from "@/types/reports";
import { cn } from "@/utils/cn";
import { dateTime } from "@/utils/format";

function Kpi({ label, value, sub, alert, to }: { label: string; value: ReactNode; sub?: string; alert?: boolean; to?: string }) {
  const body = (
    <>
      <p className="text-muted">{label}</p>
      <p className="mt-1 font-display text-4xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </>
  );
  const cls = cn("block rounded-lg border bg-surface p-5", alert ? "border-l-4 border-line border-l-caution" : "border-line",
    to && "transition-colors hover:bg-sunken/50");
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** A labelled bar per row; the number is always printed, so the bar is never the only carrier of the value. */
function BarList({ rows, max }: { rows: { label: string; value: number; tone?: string }[]; max: number }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-2 text-[15px]"><span>{r.label}</span><span className="font-semibold tabular-nums">{r.value}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken">
            <div className={cn("h-full rounded-full", r.tone ?? "bg-steel")} style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const pctText = (n: number | null) => (n == null ? "—" : `${n}%`);
const pctTone = (n: number | null) => (n == null ? "" : n >= 85 ? "text-safe" : n >= 60 ? "text-caution" : "text-danger");
const SEVERITY_BAR: Record<Severity, string> = { low: "bg-info", medium: "bg-caution", high: "bg-danger/70", critical: "bg-danger" };

export function AdminInsights({ d }: { d: AdminDashboard }) {
  const { t, locale } = useT();
  const k = d.kpis;
  const change = k.incidents_this_month - k.incidents_last_month;
  const severities: Severity[] = ["critical", "high", "medium", "low"];
  const maxSev = Math.max(...severities.map((s) => d.open_by_severity[s]));
  const maxCat = Math.max(0, ...d.hazard_categories.map((c) => c.count));

  return (
    <div className="space-y-6">
      {d.emergencies.active.map((e) => (
        <Panel key={e.id} className="flex flex-col gap-3 border-2 border-danger p-5 sm:flex-row sm:items-center">
          <Siren className="h-8 w-8 shrink-0 text-danger" aria-hidden />
          <div className="flex-1">
            <p className="font-bold text-danger">{t("ov.activeEmergency")}</p>
            <p className="text-[15px]">{t("em.roll.safe")}: <b>{e.safe}</b> · {t("em.roll.need_help")}: <b className="text-danger">{e.need_help}</b> · {t("em.roll.none")}: <b>{e.no_answer}</b></p>
          </div>
          <Link to="/app/emergency" className="font-semibold text-info hover:underline">{t("em.rollCall")}</Link>
        </Panel>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label={t("ov.openIncidents")} value={k.open_incidents} to="/app/reports" alert={k.open_incidents > 0} />
        <Kpi label={t("ov.openHazards")} value={k.open_hazards} to="/app/reports?tab=hazards" alert={k.open_hazards > 0} />
        <Kpi label={t("ov.criticalOpen")} value={k.critical_open} to="/app/reports?severity=critical" alert={k.critical_open > 0} />
        <Kpi label={t("ov.thisMonth")} value={k.incidents_this_month}
          sub={change === 0 ? t("ov.sameAsLast") : t(change > 0 ? "ov.moreThanLast" : "ov.fewerThanLast", { n: Math.abs(change) })} />
        <Kpi label={t("ov.daysSinceInjury")} value={k.days_since_injury ?? "—"} sub={t("ov.injuries90", { n: k.injuries_90d })} />
        <Kpi label={t("ov.overdueActions")} value={k.overdue_actions} alert={k.overdue_actions > 0} sub={t("ov.anonymous90", { n: k.anonymous_hazards_90d })} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel className="p-5">
          <h2 className="mb-4 text-lg font-bold">{t("ov.trend")}</h2>
          <TrendChart data={d.trend} />
        </Panel>
        <Panel className="space-y-6 p-5">
          <div>
            <h2 className="mb-3 text-lg font-bold">{t("ov.openBySeverity")}</h2>
            <BarList max={maxSev} rows={severities.map((s) => ({ label: t(severityKey(s)), value: d.open_by_severity[s], tone: SEVERITY_BAR[s] }))} />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-bold">{t("ov.topHazards")}</h2>
            <BarList max={maxCat} rows={d.hazard_categories.map((c) => ({ label: t(hazardCategoryKey(c.category as HazardCategory)), value: c.count }))} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-5">
          <p className="flex items-center gap-2 font-bold"><ShieldAlert className="h-5 w-5" aria-hidden />{t("ov.ppe")}</p>
          <p className={cn("mt-2 font-display text-4xl font-bold tabular-nums", pctTone(d.ppe.compliance))}>{pctText(d.ppe.compliance)}</p>
          <p className="text-sm text-muted">{t("ov.ppeDetail", { soon: d.ppe.due_soon, overdue: d.ppe.overdue, damaged: d.ppe.damaged })}</p>
        </Panel>
        <Panel className="p-5">
          <p className="flex items-center gap-2 font-bold"><Database className="h-5 w-5" aria-hidden />{t("ov.training")}</p>
          <p className={cn("mt-2 font-display text-4xl font-bold tabular-nums", pctTone(d.training.compliance))}>{pctText(d.training.compliance)}</p>
          <p className="text-sm text-muted">{t("ov.trainingDetail", { n: d.training.gaps })}</p>
        </Panel>
        <Panel className="p-5">
          <p className="flex items-center gap-2 font-bold"><HeartPulse className="h-5 w-5" aria-hidden />{t("ov.health")}</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {([["ov.hOverdue", d.health.overdue, true], ["ov.hDue", d.health.due_30d, false], ["ov.hRestricted", d.health.restricted, true],
              ["ov.hNever", d.health.never_checked, false]] as [MessageKey, number, boolean][]).map(([key, n, bad]) => (
              <div key={key}><dt className="text-muted">{t(key)}</dt><dd className={cn("font-display text-2xl font-bold tabular-nums", bad && n > 0 && "text-danger")}>{n}</dd></div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <h2 className="px-5 pt-4 text-lg font-bold">{t("ov.byDepartment")}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead className="border-y border-line bg-sunken/50 text-sm text-muted">
              <tr>{(["ov.colDept", "ov.colRisk", "dept.workers", "dept.openIncidents", "dept.openHazards", "dept.incidents90", "ov.colPpe", "ov.colTraining"] as MessageKey[])
                .map((h, i) => <th key={h} scope="col" className={cn("px-4 py-2 font-semibold", i > 1 && "text-right")}>{t(h)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.departments.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="px-4 py-2.5 font-semibold"><Link className="hover:underline" to={`/app/departments/${r.id}`}>{r.name}</Link></th>
                  <td className="px-4 py-2.5"><RiskBadge level={r.risk_level} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.workers}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.open_incidents}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.open_hazards}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.incidents_90d}</td>
                  <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums", pctTone(r.ppe_compliance))}>{pctText(r.ppe_compliance)}</td>
                  <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums", pctTone(r.training_compliance))}>{pctText(r.training_compliance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-3 text-lg font-bold">{t("ov.recentEmergencies")}</h2>
          {d.emergencies.recent.length === 0 ? <p className="text-muted">{t("ov.noEmergencies")}</p> : (
            <ul className="divide-y divide-line">
              {d.emergencies.recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span><span className="font-semibold">{t(`ov.em.${e.type}` as MessageKey)}</span>
                    <span className="block text-sm text-muted">{dateTime(e.created_at, locale)}</span></span>
                  <span className="flex items-center gap-2">
                    <Badge tone={e.resolved_at ? "safe" : "danger"}>{t(e.resolved_at ? "ov.resolved" : "ov.ongoing")}</Badge>
                    {e.incident_id && <Link className="text-sm font-semibold text-info hover:underline" to={`/app/reports/incidents/${e.incident_id}`}>{t("em.followUp")}</Link>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="space-y-3 p-5">
          <h2 className="text-lg font-bold">{t("ov.system")}</h2>
          <p className="flex items-start gap-2"><Bot className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span><b>{d.system.ai_mode === "demo" ? t("common.demoAi") : t("common.liveAi")}</b>
              <span className="block text-sm text-muted">{d.system.ai_mode === "demo" ? t("sys.demoAiBody") : t("sys.liveAiBody", { model: d.system.ai_model ?? "" })}</span></span></p>
          {d.system.demo_data && <p className="flex items-start gap-2"><Database className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span><b>{t("common.demoData")}</b><span className="block text-sm text-muted">{t("sys.demoDataBody")}</span></span></p>}
        </Panel>
      </div>
    </div>
  );
}
