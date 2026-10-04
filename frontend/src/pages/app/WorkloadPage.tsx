import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { HeartHandshake, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Badge, Panel, Skeleton } from "@/components/ui/misc";
import { ErgonomicsResult } from "@/pages/app/WellbeingPage";
import { useT, type MessageKey } from "@/i18n";
import { api, ApiError } from "@/services/api";
import { DRUDGERY_FACTORS, type Drudgery, type DrudgeryFactor, type Ergonomics, type TeamWellbeing } from "@/types/assess";
import type { PersonSummary } from "@/types/people";
import { cn } from "@/utils/cn";

const LEVEL_TONE = { low: "safe", moderate: "caution", high: "danger" } as const;

/** Team fatigue as totals per day. Individual answers stay private; only people who asked for support are named. */
function TeamCheckins() {
  const { t, locale } = useT();
  const [d, setD] = useState<TeamWellbeing | null>(null);
  useEffect(() => { api.wellbeing.team().then(setD).catch(() => {}); }, []);
  if (!d) return <Skeleton className="h-56" />;
  const max = Math.max(1, ...d.days.map((x) => x.checkins));
  return (
    <Panel className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">{t("work.fatigueTitle")}</h2>
        <p className="text-sm text-muted">{t("work.fatiguePrivacy")}</p>
      </div>
      <div className="flex items-end gap-2" role="img" aria-label={t("work.chartLabel")}>
        {d.days.map((x) => (
          <div key={x.day} className="flex flex-1 flex-col items-center gap-1" title={t("work.dayTip", { n: x.checkins, f: x.fatigued })}>
            <span className="text-xs tabular-nums text-muted">{x.fatigued}/{x.checkins}</span>
            <div className="flex h-28 w-full max-w-[36px] flex-col justify-end overflow-hidden rounded-t-[4px] bg-sunken">
              <div className="w-full bg-caution" style={{ height: `${(x.fatigued / max) * 100}%` }} />
              <div className="w-full bg-steel/40" style={{ height: `${((x.checkins - x.fatigued) / max) * 100}%` }} />
            </div>
            <span className="text-xs text-muted">{new Date(x.day).toLocaleDateString(locale, { weekday: "short" })}</span>
          </div>
        ))}
      </div>
      <p className="flex flex-wrap gap-4 text-sm text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-caution" />{t("work.legendFatigued")}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-steel/40" />{t("work.legendOk")}</span>
      </p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["energized", "normal", "tired", "very_tired"] as const).map((f) => (
          <div key={f} className="rounded-md bg-sunken/60 p-3"><dt className="text-sm text-muted">{t(`well.f.${f}` as MessageKey)}</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">{d.feelings_7d[f] ?? 0}</dd></div>
        ))}
      </dl>
      <p className="text-[15px]">{t("work.repeated", { n: d.repeatedly_fatigued })}</p>
      {d.support_requests.length > 0 && (
        <div className="rounded-md border-l-4 border-caution bg-caution/10 p-3">
          <p className="flex items-center gap-2 font-semibold"><HeartHandshake className="h-4 w-4" aria-hidden />{t("work.supportAsked")}</p>
          <ul className="mt-1 space-y-0.5">{d.support_requests.map((s) => (
            <li key={`${s.id}-${s.day}`}><Link className="text-info hover:underline" to={`/app/people/${s.id}`}>{s.full_name}</Link>
              <span className="text-sm text-muted"> · {new Date(s.day).toLocaleDateString(locale)}</span></li>))}</ul>
        </div>
      )}
    </Panel>
  );
}

function DrudgerySection() {
  const { t } = useT();
  const [items, setItems] = useState<Drudgery[] | null>(null);
  const [workers, setWorkers] = useState<PersonSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ user_id: "", task_name: "", factors: Object.fromEntries(DRUDGERY_FACTORS.map((k) => [k, 3])) as Record<DrudgeryFactor, number> });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.drudgery.list().then(setItems).catch(() => setItems([]));
    api.people.list({ role: "worker", page_size: 100 }).then((p) => setWorkers(p.items)).catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api.drudgery.create({ user_id: Number(f.user_id), task_name: f.task_name.trim(), factors: f.factors });
      setItems((l) => [d, ...(l ?? [])].sort((a, b) => b.score - a.score));
      setOpen(false);
      toast.success(t("drud.saved"));
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-lg font-bold">{t("drud.title")}</h2><p className="text-sm text-muted">{t("drud.subtitle")}</p></div>
        {!open && <Button variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> {t("drud.add")}</Button>}
      </div>
      {open && (
        <form onSubmit={submit} className="space-y-4 rounded-md bg-sunken/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label={t("drud.worker")} value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })} error={errors.user_id}>
              <option value="">{t("wf.chooseInvestigator")}</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.full_name} ({w.department})</option>)}
            </SelectField>
            <TextField label={t("drud.task")} value={f.task_name} onChange={(e) => setF({ ...f, task_name: e.target.value })} error={errors.task_name} maxLength={200} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {DRUDGERY_FACTORS.map((k) => (
              <fieldset key={k}>
                <legend className="text-sm font-semibold">{t(`drud.f.${k}` as MessageKey)}</legend>
                <p className="text-xs text-muted">{t(`drud.fh.${k}` as MessageKey)}</p>
                <div className="mt-1 grid grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className={cn("flex h-10 cursor-pointer items-center justify-center rounded-md border font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal",
                      f.factors[k] === n ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:bg-sunken")}>
                      <input type="radio" className="sr-only" name={`drud-${k}`} checked={f.factors[k] === n}
                        onChange={() => setF({ ...f, factors: { ...f.factors, [k]: n } })} />{n}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex gap-2"><Button type="submit" loading={busy} disabled={!f.user_id || f.task_name.trim().length < 3}>{t("drud.save")}</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button></div>
        </form>
      )}
      {!items ? <Skeleton className="h-32" /> : (
        <ul className="divide-y divide-line">
          {items.map((d) => (
            <li key={d.id} className="space-y-1.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-semibold">{d.task_name}</p><p className="text-sm text-muted">{[d.worker.full_name, d.department].filter(Boolean).join(" · ")}</p></div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-2xl font-bold tabular-nums">{d.score}</span>
                  <Badge tone={LEVEL_TONE[d.level]}>{t(`drud.level.${d.level}` as MessageKey)}</Badge>
                  <Button variant="ghost" size="icon" aria-label={t("drud.remove")} onClick={async () => {
                    await api.drudgery.remove(d.id).catch(() => {}); setItems((l) => l?.filter((x) => x.id !== d.id) ?? null); }}>
                    <Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${d.score}/100`}>
                <div className={cn("h-full rounded-full", d.level === "high" ? "bg-danger" : d.level === "moderate" ? "bg-caution" : "bg-safe")} style={{ width: `${d.score}%` }} />
              </div>
              {d.interventions.length > 0 && (
                <ul className="list-disc pl-5 text-[15px]">{d.interventions.map((k) => <li key={k}>{t(`drud.i.${k}` as MessageKey)}</li>)}</ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TeamErgonomics() {
  const { t } = useT();
  const [items, setItems] = useState<Ergonomics[] | null>(null);
  useEffect(() => { api.ergonomics.list("team").then(setItems).catch(() => setItems([])); }, []);
  return (
    <Panel className="space-y-3 p-5">
      <h2 className="text-lg font-bold">{t("work.ergoTitle")}</h2>
      {!items ? <Skeleton className="h-24" /> : items.length === 0 ? <p className="text-muted">{t("rec.none")}</p> : (
        <ul className="divide-y divide-line">{items.slice(0, 12).map((e) => (
          <li key={e.id} className="py-3"><p className="font-semibold">{e.user.full_name}</p><ErgonomicsResult e={e} /></li>))}</ul>
      )}
    </Panel>
  );
}

/** /app/workload: supervisors and admins. */
export default function WorkloadPage() {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <div><h1 className="text-[32px] font-bold">{t("work.title")}</h1><p className="mt-1 text-muted">{t("work.subtitle")}</p></div>
      <TeamCheckins />
      <DrudgerySection />
      <TeamErgonomics />
    </div>
  );
}
