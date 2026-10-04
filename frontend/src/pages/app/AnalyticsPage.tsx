import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, Printer, Send, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { useT, type MessageKey } from "@/i18n";
import { hazardCategoryKey, incidentCategoryKey, severityKey } from "@/i18n/labels";
import { api, ApiError, tokenStore } from "@/services/api";
import type { HazardCategory, IncidentCategory, Severity } from "@/types/reports";
import { cn } from "@/utils/cn";

type Signal = { kind: "category" | "department" | "location"; key: string; label: string; current: number; previous: number;
  change_pct: number | null; severity_weight: number };
type HeatDept = { department: { id: number; name: string }; locations: { id: number; name: string; x: number; y: number;
  incidents: number; hazards: number; weight: number }[] };
type Monthly = Record<string, unknown> & { month: string; summary: string; demo_mode: boolean; scope: string; incidents: number;
  incidents_prev: number; hazards: number; injuries: number; anonymous_hazards: number; by_severity: Record<Severity, number>;
  by_department: { name: string; count: number }[]; top_categories: { category: string; count: number }[];
  actions_created: number; actions_completed: number; actions_overdue_now: number; incidents_closed: number;
  training_compliance: number | null; checklists_completed: number; checklist_items_failed: number; emergencies: number;
  sources: string[]; generated_at: string };
type CopilotReply = { answer: string; intent: string | null; facts: { label: string; value: string | number }[]; sources: string[]; demo_mode: boolean };

function useCategoryLabel() {
  const { t } = useT();
  return (key: string) => {
    const [kind, code] = key.split(":");
    return kind === "incident" ? t(incidentCategoryKey(code as IncidentCategory)) : kind === "hazard" ? t(hazardCategoryKey(code as HazardCategory)) : key;
  };
}

/** Sequential single-hue scale for the heatmap; the number is always printed in the cell as well. */
const HEAT = ["bg-sunken", "bg-danger/10", "bg-danger/25", "bg-danger/45", "bg-danger-solid text-white"];
const heatStep = (w: number, max: number) => (w === 0 ? 0 : Math.min(4, 1 + Math.floor((3 * w) / Math.max(1, max))));

function Insights() {
  const { t } = useT();
  const catLabel = useCategoryLabel();
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [heat, setHeat] = useState<HeatDept[] | null>(null);
  useEffect(() => {
    api.analytics.trends().then(setSignals).catch(() => setSignals([]));
    api.analytics.heatmap().then(setHeat).catch(() => setHeat([]));
  }, []);
  const max = Math.max(1, ...(heat ?? []).flatMap((d) => d.locations.map((l) => l.weight)));
  return (
    <div className="space-y-6">
      <Panel className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><TrendingUp className="h-5 w-5" aria-hidden />{t("an.trends")}</h2>
        <p className="text-sm text-muted">{t("an.trendsHint")}</p>
        {!signals ? <Skeleton className="h-20" /> : signals.length === 0 ? <p className="text-muted">{t("an.noTrends")}</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">{signals.map((s) => (
            <li key={`${s.kind}-${s.key}`} className="rounded-md border-l-4 border-caution bg-caution/10 p-3">
              <p className="text-sm text-muted">{t(`an.kind.${s.kind}` as MessageKey)}</p>
              <p className="font-semibold">{s.kind === "category" ? catLabel(s.label) : s.label}</p>
              <p className="text-[15px]">{t("an.rise", { prev: s.previous, cur: s.current })}{s.change_pct !== null ? ` (+${s.change_pct}%)` : ""}</p>
            </li>))}</ul>
        )}
      </Panel>
      <Panel className="space-y-4 p-5">
        <div><h2 className="text-lg font-bold">{t("an.heatmap")}</h2><p className="text-sm text-muted">{t("an.heatmapHint")}</p></div>
        {!heat ? <Skeleton className="h-48" /> : heat.map((d) => {
          const cols = Math.max(1, ...d.locations.map((l) => l.x + 1));
          return (
            <div key={d.department.id}>
              <p className="mb-1.5 font-semibold">{d.department.name}</p>
              <ul className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {d.locations.map((l) => (
                  <li key={l.id} style={{ gridColumnStart: l.x + 1 }} title={t("an.cellTip", { inc: l.incidents, haz: l.hazards, w: l.weight })}
                    className={cn("rounded-md p-2.5", HEAT[heatStep(l.weight, max)])}>
                    <p className="truncate text-sm font-semibold">{l.name}</p>
                    <p className="text-xs tabular-nums">{t("an.cell", { inc: l.incidents, haz: l.hazards })}</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">{t("an.less")}{HEAT.map((c, i) => <span key={i} className={cn("h-3 w-6 rounded-sm", c)} />)}{t("an.more")}</p>
      </Panel>
    </div>
  );
}

function Copilot() {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; r: CopilotReply }[]>([]);
  const [busy, setBusy] = useState(false);
  const examples: MessageKey[] = ["an.ex1", "an.ex2", "an.ex3", "an.ex4"];
  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    try { const r = await api.analytics.copilot(question.trim()); setLog((l) => [{ q: question.trim(), r }, ...l]); setQ(""); }
    catch (e) { setLog((l) => [{ q: question, r: { answer: e instanceof ApiError ? e.message : t("ai.failed"), intent: null, facts: [], sources: [], demo_mode: true } }, ...l]); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <Panel className="space-y-3 p-5">
        <p className="text-sm text-muted">{t("an.copilotHint")}</p>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); ask(q); }} className="flex gap-2">
          <label htmlFor="cq" className="sr-only">{t("an.ask")}</label>
          <input id="cq" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder={t("an.ask")}
            className="h-11 flex-1 rounded-md border border-line bg-surface px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-signal" />
          <Button type="submit" loading={busy} disabled={q.trim().length < 3}>{!busy && <Send className="h-4 w-4" aria-hidden />} {t("ai.send")}</Button>
        </form>
        <div className="flex flex-wrap gap-2">{examples.map((k) => (
          <button key={k} type="button" onClick={() => ask(t(k))} className="min-h-[40px] rounded-full border border-line px-3 text-sm hover:bg-sunken">{t(k)}</button>))}</div>
      </Panel>
      {log.map(({ q: question, r }, i) => (
        <Panel key={i} className="space-y-3 p-5">
          <p className="font-semibold">{question}</p>
          <div className="flex items-center gap-2 text-sm text-muted"><Sparkles className="h-4 w-4 text-info" aria-hidden />
            {r.demo_mode ? t("common.demoAi") : t("common.liveAi")}</div>
          <p>{r.answer}</p>
          {r.facts.length > 0 && (
            <table className="w-full text-left text-[15px]"><caption className="sr-only">{t("an.facts")}</caption>
              <tbody className="divide-y divide-line">{r.facts.map((f, j) => (
                <tr key={j}><th scope="row" className="py-1.5 pr-4 font-medium">{f.label}</th><td className="py-1.5 tabular-nums">{f.value}</td></tr>))}</tbody></table>
          )}
          {r.sources.length > 0 && <p className="text-xs text-muted">{t("an.sources")}: {r.sources.join("; ")}</p>}
        </Panel>
      ))}
    </div>
  );
}

function MonthlyReport() {
  const { t } = useT();
  const catLabel = useCategoryLabel();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [m, setM] = useState<Monthly | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setM(null); setFailed(false); api.analytics.monthly(month).then((d) => setM(d as Monthly)).catch(() => setFailed(true)); }, [month]);
  const stat = (label: MessageKey, value: string | number) => (
    <div className="rounded-md border border-line p-3"><p className="text-sm text-muted">{t(label)}</p><p className="font-display text-2xl font-bold tabular-nums">{value}</p></div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <TextField label={t("an.month")} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <Button variant="outline" onClick={() => window.print()} disabled={!m}><Printer className="h-4 w-4" aria-hidden /> {t("train.print")}</Button>
      </div>
      {failed ? <Panel><EmptyState icon={<TrendingUp className="h-6 w-6" />} title={t("an.failed")} body="" /></Panel> : !m ? <Skeleton className="h-96" /> : (
        <Panel className="space-y-5 p-6 print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="text-2xl font-bold">{t("an.reportTitle", { month: m.month })}</h2><p className="text-muted">{t("an.scope", { scope: m.scope === "all" ? t("an.allSites") : m.scope })}</p></div>
            <Badge tone="info">{m.demo_mode ? t("common.demoAi") : t("common.liveAi")}</Badge>
          </div>
          <p className="rounded-md bg-info/5 p-4 text-[17px] leading-relaxed"><Sparkles className="mr-1 inline h-4 w-4 text-info" aria-hidden />{m.summary}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stat("ov.incidents", m.incidents)}{stat("ov.injuries", m.injuries)}{stat("ov.hazards", m.hazards)}{stat("an.closed", m.incidents_closed)}
            {stat("an.actionsOpened", m.actions_created)}{stat("an.actionsDone", m.actions_completed)}{stat("ov.overdueActions", m.actions_overdue_now)}
            {stat("ov.training", m.training_compliance === null ? "—" : `${m.training_compliance}%`)}
            {stat("an.checklists", m.checklists_completed)}{stat("an.noAnswers", m.checklist_items_failed)}{stat("an.emergencies", m.emergencies)}{stat("an.anonymous", m.anonymous_hazards)}
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <div><h3 className="mb-2 font-sans text-base font-bold">{t("an.bySeverity")}</h3>
              <ul className="space-y-1">{(["critical", "high", "medium", "low"] as Severity[]).map((s) => <li key={s} className="flex justify-between"><span>{t(severityKey(s))}</span><span className="tabular-nums">{m.by_severity[s]}</span></li>)}</ul></div>
            <div><h3 className="mb-2 font-sans text-base font-bold">{t("ov.byDepartment")}</h3>
              <ul className="space-y-1">{m.by_department.map((d) => <li key={d.name} className="flex justify-between"><span>{d.name}</span><span className="tabular-nums">{d.count}</span></li>)}</ul></div>
            <div><h3 className="mb-2 font-sans text-base font-bold">{t("an.topCats")}</h3>
              <ul className="space-y-1">{m.top_categories.map((c) => <li key={c.category} className="flex justify-between"><span>{catLabel(c.category)}</span><span className="tabular-nums">{c.count}</span></li>)}</ul></div>
          </div>
          <p className="text-xs text-muted">{t("an.sources")}: {m.sources.join("; ")}</p>
        </Panel>
      )}
    </div>
  );
}

function Exports() {
  const { t } = useT();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  async function download(kind: string) {
    setBusy(kind);
    try {
      const qs = new URLSearchParams(Object.entries({ date_from: from, date_to: to }).filter(([, v]) => v));
      const token = tokenStore.get();
      const res = await fetch(`/api/analytics/export/${kind}.csv?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: `${kind}-${new Date().toISOString().slice(0, 10)}.csv` });
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error(t("an.exportFailed")); } finally { setBusy(null); }
  }
  return (
    <Panel className="space-y-4 p-5">
      <p className="text-sm text-muted">{t("an.exportHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("audit.from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label={t("audit.to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {(["incidents", "hazards", "actions", "risks"] as const).map((k) => (
          <Button key={k} variant="outline" loading={busy === k} onClick={() => download(k)}><Download className="h-4 w-4" aria-hidden /> {t(`an.export.${k}` as MessageKey)}</Button>
        ))}
      </div>
    </Panel>
  );
}

/** /app/analytics: supervisors and admins. */
export default function AnalyticsPage() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const tabs = ["insights", "copilot", "monthly", "export"] as const;
  const tab = (tabs as readonly string[]).includes(params.get("tab") ?? "") ? params.get("tab")! : "insights";
  return (
    <div className="space-y-6">
      <div className="print:hidden"><h1 className="text-[32px] font-bold">{t("an.title")}</h1><p className="mt-1 text-muted">{t("an.subtitle")}</p></div>
      <div role="tablist" aria-label={t("an.title")} className="flex gap-1 overflow-x-auto border-b border-line print:hidden">
        {tabs.map((k) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setParams(k === "insights" ? {} : { tab: k })}
            className={cn("min-h-[44px] shrink-0 border-b-2 px-4 text-[15px] font-semibold", tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t(`an.tab.${k}` as MessageKey)}</button>
        ))}
      </div>
      {tab === "insights" && <Insights />}
      {tab === "copilot" && <Copilot />}
      {tab === "monthly" && <MonthlyReport />}
      {tab === "export" && <Exports />}
    </div>
  );
}
