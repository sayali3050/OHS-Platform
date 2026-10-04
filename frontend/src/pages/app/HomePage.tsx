import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { FormAlert, Panel, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { SeverityBadge, StatusBadge } from "@/components/reports/badges";
import { LanguagePanel } from "@/components/LanguageSwitcher";
import { AdminInsights } from "@/components/admin/AdminInsights";
import { SupervisorKpis } from "@/components/admin/SupervisorKpis";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { hazardCategoryKey } from "@/i18n/labels";
import { api } from "@/services/api";
import type { HazardStatus, HazardSummary, IncidentStatus, IncidentSummary, Severity } from "@/types/reports";
import type { AdminDashboard } from "@/types/people";
import { shortDate } from "@/utils/format";

export function greetingKey(): MessageKey {
  const h = new Date().getHours();
  return h < 12 ? "home.morning" : h < 17 ? "home.afternoon" : "home.evening";
}

type Recent = { incidents: IncidentSummary[]; hazards: HazardSummary[]; newIncidents: number; openHazards: number; total: number };

function useRecentReports() {
  const [data, setData] = useState<Recent | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([
      api.incidents.list({ page_size: 5 }), api.hazards.list({ page_size: 5 }),
      api.incidents.list({ page_size: 1, status: "reported" }), api.hazards.list({ page_size: 1, status: "open" }),
    ]).then(([i, h, ni, oh]) => setData({
      incidents: i.items, hazards: h.items, newIncidents: ni.total, openHazards: oh.total, total: i.total + h.total,
    })).catch(() => setFailed(true));
  }, []);
  return { data, failed };
}

type Row = { id: number; href: string; ref: string; title: string; severity: Severity; status: IncidentStatus | HazardStatus;
  kind: "incident" | "hazard"; when: string; where?: string };

/** Latest incidents and hazards side by side. Both lists use the API's visibility rules. */
function LatestReports({ data }: { data: Recent | null }) {
  const { t, locale } = useT();
  const lists: { key: string; title: MessageKey; to: string; rows?: Row[] }[] = [
    { key: "incidents", title: "home.latestIncidents", to: "/app/reports", rows: data?.incidents.map((i) => ({
      id: i.id, href: `/app/reports/incidents/${i.id}`, ref: i.reference, title: i.title, severity: i.severity,
      status: i.status, kind: "incident", when: i.created_at, where: i.location?.name ?? i.department?.name })) },
    { key: "hazards", title: "home.latestHazards", to: "/app/reports?tab=hazards", rows: data?.hazards.map((h) => ({
      id: h.id, href: `/app/reports/hazards/${h.id}`, ref: h.reference, title: t(hazardCategoryKey(h.category)),
      severity: h.severity, status: h.status, kind: "hazard", when: h.created_at, where: h.location?.name ?? h.department?.name })) },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {lists.map((l) => (
        <Panel key={l.key} className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="text-lg font-bold">{t(l.title)}</h2>
            <Link to={l.to} className="inline-flex min-h-[44px] items-center gap-0.5 text-[15px] font-semibold text-info hover:underline">
              {t("common.seeAll")} <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {!l.rows ? <div className="space-y-2 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            : l.rows.length === 0 ? <p className="px-5 pb-5 text-muted">{t("home.nothing")}</p> : (
            <ul className="mt-1 divide-y divide-line border-t border-line">
              {l.rows.map((r) => (
                <li key={r.id}>
                  <Link to={r.href} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.title}</p>
                      <p className="truncate text-sm text-muted">{[r.ref, r.where, shortDate(r.when, locale)].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row">
                      <SeverityBadge severity={r.severity} /><StatusBadge status={r.status} kind={r.kind} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ))}
    </div>
  );
}

/** Supervisor home: what has come in from the department, with links into the workflow. */
export function SupervisorHome() {
  const { user } = useAuth();
  const { t } = useT();
  const { data, failed } = useRecentReports();
  if (!user) return null;
  const cards = data && [
    { label: t("home.newIncidents"), value: data.newIncidents, to: "/app/reports?status=reported", alert: data.newIncidents > 0 },
    { label: t("home.openHazards"), value: data.openHazards, to: "/app/reports?tab=hazards&status=open", alert: data.openHazards > 0 },
    { label: t("home.deptReports"), value: data.total, to: "/app/reports", alert: false },
  ];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted">{t(greetingKey())},</p>
        <h1 className="text-[32px] font-bold">{user.full_name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted">{user.department ? user.department.name : t("home.noDept")}</p>
      </div>
      {failed && <FormAlert>{t("home.loadFailed")}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-3">
        {cards ? cards.map((c) => (
          <Link key={c.label} to={c.to} className={`rounded-lg border bg-surface p-5 transition-colors hover:bg-sunken/50 ${c.alert ? "border-l-4 border-line border-l-caution" : "border-line"}`}>
            <p className="text-muted">{c.label}</p>
            <p className="mt-1 font-display text-4xl font-bold tabular-nums">{c.value}</p>
          </Link>
        )) : [0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px]" />)}
      </div>
      <SupervisorKpis />
      <LatestReports data={data} />
      <LanguagePanel />
    </div>
  );
}

export function AdminOverview() {
  const reports = useRecentReports();
  const { t } = useT();
  const [stats, setStats] = useState<{ total: number; workers: number; supervisors: number; pending: number } | null>(null);
  const [insights, setInsights] = useState<AdminDashboard | null>(null);
  useEffect(() => { api.dashboard.admin().then(setInsights).catch(() => {}); }, []);
  useEffect(() => {
    Promise.all([
      api.users.list({ page_size: 1 }),
      api.users.list({ page_size: 1, role: "worker" }),
      api.users.list({ page_size: 1, role: "supervisor", is_active: true }),
      api.users.list({ page_size: 1, role: "supervisor", is_active: false }),
    ]).then(([a, w, s, p]) => setStats({ total: a.total, workers: w.total, supervisors: s.total, pending: p.total }));
  }, []);

  const cards = stats && [
    { label: t("admin.people"), value: stats.total },
    { label: t("admin.workers"), value: stats.workers },
    { label: t("admin.activeSupervisors"), value: stats.supervisors },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-[32px] font-bold">{t("admin.title")}</h1>
      {stats && stats.pending > 0 && (
        <Panel className="flex flex-col gap-3 border-l-4 border-l-caution p-5 sm:flex-row sm:items-center sm:justify-between">
          <p><span className="font-semibold">{stats.pending === 1 ? t("admin.pendingOne") : t("admin.pendingMany", { count: stats.pending })}</span>
            <span className="text-muted"> {t("admin.pendingNote")}</span></p>
          <Button variant="secondary" asChild><Link to="/app/admin/users?status=pending">{t("admin.review")}</Link></Button>
        </Panel>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {cards ? cards.map((c) => (
          <Panel key={c.label} className="p-5">
            <p className="text-muted">{c.label}</p>
            <p className="mt-1 font-display text-4xl font-bold tabular-nums">{c.value}</p>
          </Panel>
        )) : [0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px]" />)}
      </div>
      {insights ? <AdminInsights d={insights} /> : <Skeleton className="h-96" />}
      <LatestReports data={reports.data} />
    </div>
  );
}
