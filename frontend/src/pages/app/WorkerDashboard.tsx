import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ChevronRight, ClipboardList, FilePlus2, Info, ShieldAlert, TriangleAlert } from "lucide-react";
import { Badge, EmptyState, FormAlert, Panel, Skeleton } from "@/components/ui/misc";
import { LanguagePanel } from "@/components/LanguageSwitcher";
import { SirenButton } from "@/components/SirenButton";
import { SeverityBadge, StatusBadge } from "@/components/reports/badges";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { catalogLabel, hazardCategoryKey } from "@/i18n/labels";
import { greetingKey } from "@/pages/app/HomePage";
import { api } from "@/services/api";
import type { WorkerDashboard as Data } from "@/types/reports";
import { cn } from "@/utils/cn";
import { shortDate } from "@/utils/format";

type T = ReturnType<typeof useT>["t"];

const BAND = {
  good: { tone: "safe", stroke: "stroke-safe" },
  fair: { tone: "caution", stroke: "stroke-caution" },
  needs_attention: { tone: "danger", stroke: "stroke-danger" },
} as const;

const PPE_TONE = { ok: "safe", due_soon: "caution", overdue: "danger", damaged: "danger", missing: "danger" } as const;
const TRAINING_TONE = { valid: "safe", expiring: "caution", expired: "danger", in_progress: "info", not_started: "neutral" } as const;

/** The server sends English explanations; rebuild them from the same lists so they read in the user's language. */
function explain(t: T, data: Data, key: "ppe" | "training") {
  if (key === "ppe") {
    const bad = data.ppe.filter((p) => !p.compliant);
    if (!bad.length) return t("dash.ppeAllOk", { count: data.ppe.length });
    const items = bad.map((p) => `${catalogLabel(t, "ppeItem", p.name)} (${t(`ppe.${p.status}` as MessageKey)})`).join(", ");
    return t("dash.ppeSome", { ok: data.ppe.length - bad.length, total: data.ppe.length, items });
  }
  const mandatory = data.training.filter((c) => c.mandatory);
  const bad = mandatory.filter((c) => !c.current);
  if (!bad.length) return t("dash.trainingAllOk", { count: mandatory.length });
  const items = bad.map((c) => `${catalogLabel(t, "course", c.title)} (${t(`training.${c.status}` as MessageKey)})`).join(", ");
  return t("dash.trainingSome", { ok: mandatory.length - bad.length, total: mandatory.length, items });
}

function ScoreRing({ score, band }: { score: number; band: keyof typeof BAND }) {
  const { t } = useT();
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" className="stroke-sunken" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" strokeLinecap="round" className={BAND[band].stroke}
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><span className="font-display text-4xl font-bold tabular-nums">{score}</span><span className="block text-sm text-muted">{t("dash.outOf")}</span></div>
      </div>
    </div>
  );
}

function QuickActions() {
  const { t } = useT();
  const base = "flex min-h-[76px] items-center gap-4 rounded-lg px-5 text-left font-semibold transition-colors";
  const actions: { to: string; title: MessageKey; sub: MessageKey; Icon: typeof TriangleAlert; tone: string }[] = [
    { to: "/app/report/hazard", title: "dash.qHazard", sub: "dash.qHazardSub", Icon: TriangleAlert, tone: "bg-signal text-signal-ink hover:bg-signal/90" },
    { to: "/app/report/incident", title: "dash.qIncident", sub: "dash.qIncidentSub", Icon: FilePlus2, tone: "bg-ink text-bg hover:bg-ink/90" },
    { to: "/app/emergency", title: "dash.qEmergency", sub: "dash.qEmergencySub", Icon: ShieldAlert, tone: "bg-danger text-white hover:bg-danger/90" },
    { to: "/app/assistant", title: "dash.qAssistant", sub: "dash.qAssistantSub", Icon: Bot, tone: "border border-line bg-surface hover:bg-sunken" },
  ];
  return (
    <nav aria-label={t("dash.quickActions")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {actions.map(({ to, title, sub, Icon, tone }) => (
        <Link key={to} to={to} className={cn(base, tone)}>
          <Icon className="h-7 w-7 shrink-0" aria-hidden />
          <span><span className="block text-lg leading-tight">{t(title)}</span><span className="block text-sm font-medium opacity-80">{t(sub)}</span></span>
        </Link>
      ))}
    </nav>
  );
}

export default function WorkerDashboard() {
  const { user } = useAuth();
  const { t, locale } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { api.dashboard.worker().then(setData).catch(() => setError(true)); }, []);
  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted">{t(greetingKey())},</p>
        <h1 className="text-[32px] font-bold">{user.full_name.split(" ")[0]}</h1>
      </div>

      <SirenButton />
      <QuickActions />
      <LanguagePanel />
      {error && <FormAlert>{t("dash.loadFailed")}</FormAlert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <Panel className="p-5">
          <h2 className="text-lg font-bold">{t("dash.scoreTitle")}</h2>
          {!data ? <Skeleton className="mt-4 h-40" /> : data.score === null ? (
            <p className="mt-3 text-muted">{t("dash.noScore")}</p>
          ) : (
            <>
              <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                <ScoreRing score={data.score} band={data.band!} />
                <div className="w-full space-y-4">
                  <Badge tone={BAND[data.band!].tone}>{t(`dash.band.${data.band!}` as MessageKey)}</Badge>
                  {data.components.map((c) => {
                    const label = t(c.key === "ppe" ? "dash.ppeLabel" : "dash.trainingLabel");
                    return (
                      <div key={c.key}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold">{label}</span>
                          <span className="tabular-nums"><span className="font-bold">{c.score}%</span>
                            <span className="text-sm text-muted"> · {t("dash.weight", { pct: Math.round(c.weight * 100) })}</span></span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${label}: ${c.score}%`}>
                          <div className={cn("h-full rounded-full", c.score >= 85 ? "bg-safe" : c.score >= 60 ? "bg-caution" : "bg-danger")}
                            style={{ width: `${c.score}%` }} />
                        </div>
                        <p className="mt-1.5 text-sm text-muted">{explain(t, data, c.key)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-5 flex gap-2 border-t border-line pt-4 text-sm text-muted">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t("dash.method")}
              </p>
            </>
          )}
        </Panel>

        <Panel className="flex flex-col">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-lg font-bold">{t("dash.reportsTitle")}</h2>
            <Link to="/app/reports" className="inline-flex min-h-[44px] items-center gap-0.5 text-[15px] font-semibold text-info hover:underline">
              {t("common.seeAll")} <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {!data ? <div className="space-y-2 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : (
            <>
              <p className="px-5 text-sm text-muted">
                {t("dash.openCounts", { incidents: data.reports.open_incidents, hazards: data.reports.open_hazards })}
              </p>
              {data.reports.recent.length === 0 ? (
                <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={t("dash.noReportsTitle")}
                  body={t("dash.noReportsBody")} />
              ) : (
                <ul className="mt-2 divide-y divide-line border-t border-line">
                  {data.reports.recent.map((r) => (
                    <li key={`${r.kind}-${r.id}`}>
                      <Link to={`/app/reports/${r.kind === "incident" ? "incidents" : "hazards"}/${r.id}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{r.kind === "incident" ? r.title : t(hazardCategoryKey(r.category))}</p>
                          <p className="text-sm text-muted">{r.reference} · {shortDate(r.created_at, locale)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row">
                          <SeverityBadge severity={r.severity} /><StatusBadge status={r.status} kind={r.kind} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="overflow-hidden">
          <h2 className="px-5 pt-5 text-lg font-bold">{t("dash.ppeTitle")}</h2>
          {!data ? <Skeleton className="m-5 h-32" /> : data.ppe.length === 0 ? (
            <p className="p-5 text-muted">{t("dash.noPpe")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {data.ppe.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-semibold">{catalogLabel(t, "ppeItem", p.name)}</p>
                    <p className="text-sm text-muted">{t("dash.replaceBy", { date: shortDate(p.replace_by, locale) })}</p>
                  </div>
                  <Badge tone={PPE_TONE[p.status]}>{t(`ppe.${p.status}` as MessageKey)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="overflow-hidden">
          <h2 className="px-5 pt-5 text-lg font-bold">{t("dash.trainingTitle")}</h2>
          {!data ? <Skeleton className="m-5 h-32" /> : (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {data.training.map((c) => (
                <li key={c.course_id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{catalogLabel(t, "course", c.title)}</p>
                    <p className="text-sm text-muted">
                      {t(c.mandatory ? "dash.mandatory" : "dash.optional")}
                      {c.status === "in_progress" ? ` · ${t("dash.pctDone", { pct: c.completion_pct })}`
                        : c.expires_on ? ` · ${t(c.status === "expired" ? "dash.expiredOn" : "dash.validUntil", { date: shortDate(c.expires_on, locale) })}` : ""}
                    </p>
                  </div>
                  <Badge tone={TRAINING_TONE[c.status]}>{t(`training.${c.status}` as MessageKey)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
