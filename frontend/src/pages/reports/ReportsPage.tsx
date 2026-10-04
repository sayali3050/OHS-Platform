import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ClipboardList, Search, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { SeverityBadge, StatusBadge } from "@/components/reports/badges";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { hazardCategoryKey, incidentCategoryKey, severityKey, statusKey } from "@/i18n/labels";
import type { Department } from "@/types/auth";
import { api, ApiError } from "@/services/api";
import {
  HAZARD_CATEGORY_VALUES, HAZARD_FLOW, INCIDENT_CATEGORY_VALUES, INCIDENT_FLOW, SEVERITY_VALUES, type HazardSummary,
  type IncidentSummary, type ReportPage,
} from "@/types/reports";
import { cn } from "@/utils/cn";
import { shortDate } from "@/utils/format";

const PAGE_SIZE = 15;
const control = "h-11 rounded-md border border-line bg-surface px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-signal";

export default function ReportsPage() {
  const { user } = useAuth();
  const { t, locale } = useT();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "hazards" ? "hazards" : "incidents";
  const status = params.get("status") ?? "";
  const severity = params.get("severity") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [data, setData] = useState<ReportPage<IncidentSummary> | ReportPage<HazardSummary> | null>(null);
  const staff = user?.role === "supervisor" || user?.role === "admin";
  const [depts, setDepts] = useState<Department[]>([]);
  useEffect(() => { if (user?.role === "admin") api.auth.departments().then(setDepts).catch(() => {}); }, [user?.role]);
  const filter = (k: string) => params.get(k) ?? "";

  useEffect(() => {
    setData(null);
    const query = {
      q: params.get("q"), status, severity, page, page_size: PAGE_SIZE, category: params.get("category"),
      department_id: params.get("department_id"), date_from: params.get("from"), date_to: params.get("to"),
      assigned_to_me: tab === "incidents" && params.get("mine") === "1" ? true : undefined,
    };
    (tab === "incidents" ? api.incidents.list(query) : api.hazards.list(query))
      .then(setData)
      .catch((e) => toast.error(e instanceof ApiError ? e.message : t("list.loadFailed")));
  }, [tab, status, severity, page, params]); // t only changes the error text

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };

  const kind = tab === "incidents" ? "incident" : "hazard";
  const statuses = tab === "incidents" ? INCIDENT_FLOW : HAZARD_FLOW;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const title = t(user?.role === "worker" ? "list.myTitle" : "list.title");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] font-bold">{title}</h1>
          {data && <p className="mt-1 text-muted">{t(`list.scope.${data.scope}` as MessageKey)}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/app/report/hazard">{t("dash.qHazard")}</Link></Button>
          <Button asChild variant="outline"><Link to="/app/report/incident">{t("dash.qIncident")}</Link></Button>
        </div>
      </div>

      <div role="tablist" aria-label={t("list.type")} className="inline-flex rounded-md border border-line bg-surface p-1">
        {(["incidents", "hazards"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button"
            onClick={() => setParams(k === "incidents" ? {} : { tab: k })}
            className={cn("min-h-[40px] rounded px-5 text-[15px] font-semibold transition-colors",
              tab === k ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
            {t(`list.${k}`)}
          </button>
        ))}
      </div>

      <form role="search" className="flex flex-col gap-3 md:flex-row" onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="r-q" className="sr-only">{t("list.searchLabel")}</label>
          <input id="r-q" className={`${control} w-full pl-9`} placeholder={t("list.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="sr-only" htmlFor="r-status">{t("list.status")}</label>
        <select id="r-status" className={control} value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">{t("list.anyStatus")}</option>
          {statuses.map((v) => <option key={v} value={v}>{t(statusKey(v, kind))}</option>)}
        </select>
        <label className="sr-only" htmlFor="r-sev">{t("list.severity")}</label>
        <select id="r-sev" className={control} value={severity} onChange={(e) => update({ severity: e.target.value })}>
          <option value="">{t("list.anySeverity")}</option>
          {[...SEVERITY_VALUES].reverse().map((v) => <option key={v} value={v}>{t(severityKey(v))}</option>)}
        </select>
        <Button type="submit" variant="secondary">{t("common.search")}</Button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="r-cat">{t("detail.type")}</label>
        <select id="r-cat" className={control} value={filter("category")} onChange={(e) => update({ category: e.target.value })}>
          <option value="">{t("list.anyType")}</option>
          {tab === "incidents"
            ? INCIDENT_CATEGORY_VALUES.map((c) => <option key={c} value={c}>{t(incidentCategoryKey(c))}</option>)
            : HAZARD_CATEGORY_VALUES.map((c) => <option key={c} value={c}>{t(hazardCategoryKey(c))}</option>)}
        </select>
        {depts.length > 0 && (
          <>
            <label className="sr-only" htmlFor="r-dept">{t("register.department")}</label>
            <select id="r-dept" className={control} value={filter("department_id")} onChange={(e) => update({ department_id: e.target.value })}>
              <option value="">{t("board.allDepts")}</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-muted">{t("audit.from")}
          <input type="date" className={control} value={filter("from")} onChange={(e) => update({ from: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm text-muted">{t("audit.to")}
          <input type="date" className={control} value={filter("to")} onChange={(e) => update({ to: e.target.value })} /></label>
        {staff && tab === "incidents" && (
          <label className="flex min-h-[44px] items-center gap-2 text-[15px] font-medium">
            <input type="checkbox" className="h-5 w-5" checked={filter("mine") === "1"} onChange={(e) => update({ mine: e.target.checked ? "1" : "" })} />
            {t("list.assignedToMe")}
          </label>
        )}
      </div>

      <Panel className="overflow-hidden">
        {!data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={t(tab === "incidents" ? "list.emptyIncidents" : "list.emptyHazards")}
            body={t(params.toString() && params.toString() !== "tab=hazards" ? "list.emptyFiltered" : "list.emptyNone")}
            action={<Button variant="outline" onClick={() => { setQ(""); setParams(tab === "hazards" ? { tab } : {}); }}>{t("common.clearFilters")}</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {tab === "incidents"
              ? (data.items as IncidentSummary[]).map((i) => (
                <ReportRow key={i.id} to={`/app/reports/incidents/${i.id}`} reference={i.reference} title={i.title}
                  meta={[t(incidentCategoryKey(i.category)), i.location?.name ?? i.department?.name, shortDate(i.occurred_at, locale),
                    user?.role !== "worker" ? i.reporter?.full_name : undefined]}
                  severity={<SeverityBadge severity={i.severity} />} status={<StatusBadge status={i.status} kind="incident" />} />
              ))
              : (data.items as HazardSummary[]).map((h) => (
                <ReportRow key={h.id} to={`/app/reports/hazards/${h.id}`} reference={h.reference}
                  title={t(hazardCategoryKey(h.category))}
                  meta={[h.description.length > 70 ? `${h.description.slice(0, 70)}…` : h.description,
                    h.location?.name ?? h.department?.name, shortDate(h.created_at, locale)]}
                  extra={h.is_anonymous && user?.role !== "worker"
                    ? <span className="inline-flex items-center gap-1 text-sm text-muted"><UserX className="h-3.5 w-3.5" aria-hidden />{t("list.anonymous")}</span>
                    : user?.role !== "worker" && h.reporter ? <span className="text-sm text-muted">{h.reporter.full_name}</span> : null}
                  severity={<SeverityBadge severity={h.severity} />} status={<StatusBadge status={h.status} kind="hazard" />} />
              ))}
          </ul>
        )}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
            <span>{t("common.range", { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, data.total), total: data.total })}</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label={t("common.prevPage")}><ChevronLeft className="h-5 w-5" /></Button>
              <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })} aria-label={t("common.nextPage")}><ChevronRight className="h-5 w-5" /></Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function ReportRow({ to, reference, title, meta, severity, status, extra }: {
  to: string; reference: string; title: string; meta: (string | undefined | null)[];
  severity: ReactNode; status: ReactNode; extra?: ReactNode;
}) {
  return (
    <li>
      <Link to={to} className="flex flex-col gap-2 px-4 py-3.5 hover:bg-sunken/50 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold tabular-nums text-muted">{reference}</span>
            <span className="font-semibold">{title}</span>
          </p>
          <p className="mt-0.5 truncate text-sm text-muted">{meta.filter(Boolean).join(" · ")}</p>
          {extra}
        </div>
        <div className="flex shrink-0 gap-2">{severity}{status}</div>
      </Link>
    </li>
  );
}
