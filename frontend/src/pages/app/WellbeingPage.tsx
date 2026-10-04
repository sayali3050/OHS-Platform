import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BatteryLow, CheckCircle2, HeartHandshake, Smile, Meh, Frown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Badge, Panel, Skeleton } from "@/components/ui/misc";
import { useT, type MessageKey } from "@/i18n";
import { api, ApiError } from "@/services/api";
import {
  BODY_AREAS, FEELINGS, POSTURES, type Checkin, type CheckinInput, type Drudgery, type Ergonomics, type ErgonomicsInput,
} from "@/types/assess";
import { BAND_TONE } from "@/pages/app/RiskPage";
import { cn } from "@/utils/cn";
import { shortDate } from "@/utils/format";

const FEELING_ICON = { energized: Zap, normal: Smile, tired: Meh, very_tired: Frown } as const;
const today = () => new Date().toISOString().slice(0, 10);

function OneToFive({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number; onChange: (n: number) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="w-20 text-xs text-muted">{low}</span>
        <div className="grid flex-1 grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={cn("flex h-11 cursor-pointer items-center justify-center rounded-md border font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal",
              value === n ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:bg-sunken")}>
              <input type="radio" className="sr-only" name={label} checked={value === n} onChange={() => onChange(n)} />{n}
            </label>
          ))}
        </div>
        <span className="w-20 text-right text-xs text-muted">{high}</span>
      </div>
    </fieldset>
  );
}

/** One tap for how you feel, four quick scales, and an optional "check in with me". About 30 seconds. */
function CheckinCard() {
  const { t, locale } = useT();
  const [history, setHistory] = useState<Checkin[] | null>(null);
  const [f, setF] = useState<CheckinInput>({ feeling: "normal", sleep_quality: 3, workload: 3, physical_fatigue: 2, mental_workload: 2, support_requested: false });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    api.wellbeing.mine().then((h) => {
      setHistory(h);
      const mine = h.find((c) => c.checkin_date === today());
      if (mine) setF({ feeling: mine.feeling, sleep_quality: mine.sleep_quality, workload: mine.workload,
        physical_fatigue: mine.physical_fatigue, mental_workload: mine.mental_workload, support_requested: mine.support_requested });
    }).catch(() => setHistory([]));
  }, []);
  const done = history?.find((c) => c.checkin_date === today());
  const set = <K extends keyof CheckinInput>(k: K, v: CheckinInput[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await api.wellbeing.today(f);
      setHistory((h) => [saved, ...(h ?? []).filter((c) => c.checkin_date !== saved.checkin_date)]);
      setEditing(false);
      toast.success(t(saved.support_requested ? "well.sentSupport" : "well.thanks"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("capa.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">{t("well.checkinTitle")}</h2>
        <p className="text-sm text-muted">{t("well.checkinPrivacy")}</p>
      </div>
      {done && !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 font-semibold text-safe"><CheckCircle2 className="h-5 w-5" aria-hidden />{t("well.doneToday")}</p>
          {done.fatigued && <Badge tone="caution">{t("well.fatigued")}</Badge>}
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>{t("prof.edit")}</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold">{t("well.feeling")}</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FEELINGS.map((x) => {
                const Icon = FEELING_ICON[x];
                return (
                  <label key={x} className={cn("flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal",
                    f.feeling === x ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:bg-sunken")}>
                    <input type="radio" className="sr-only" name="feeling" checked={f.feeling === x} onChange={() => set("feeling", x)} />
                    <Icon className="h-6 w-6" aria-hidden />{t(`well.f.${x}` as MessageKey)}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <OneToFive label={t("well.sleep")} low={t("well.poor")} high={t("well.good")} value={f.sleep_quality} onChange={(n) => set("sleep_quality", n)} />
          <OneToFive label={t("well.workload")} low={t("well.light")} high={t("well.heavy")} value={f.workload} onChange={(n) => set("workload", n)} />
          <OneToFive label={t("well.physical")} low={t("well.none")} high={t("well.lot")} value={f.physical_fatigue} onChange={(n) => set("physical_fatigue", n)} />
          <OneToFive label={t("well.mental")} low={t("well.none")} high={t("well.lot")} value={f.mental_workload} onChange={(n) => set("mental_workload", n)} />
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border border-line p-3">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={f.support_requested} onChange={(e) => set("support_requested", e.target.checked)} />
            <span><span className="flex items-center gap-2 font-semibold"><HeartHandshake className="h-4 w-4" aria-hidden />{t("well.support")}</span>
              <span className="block text-sm text-muted">{t("well.supportHint")}</span></span>
          </label>
          <Button type="submit" loading={busy}>{t("well.send")}</Button>
        </form>
      )}
      {history && history.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-muted">{t("well.last14")}</p>
          <ol className="flex flex-wrap gap-1.5">
            {[...history].reverse().map((c) => {
              const Icon = FEELING_ICON[c.feeling];
              return (
                <li key={c.checkin_date} title={`${shortDate(c.checkin_date, locale)}: ${t(`well.f.${c.feeling}` as MessageKey)}`}
                  className={cn("grid h-10 w-10 place-items-center rounded-md border", c.fatigued ? "border-caution bg-caution/15" : "border-line bg-surface")}>
                  <Icon className="h-5 w-5" aria-hidden /><span className="sr-only">{shortDate(c.checkin_date, locale)}: {t(`well.f.${c.feeling}` as MessageKey)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Panel>
  );
}

const BLANK: ErgonomicsInput = { task_description: "", hours_per_day: 8, lifts_per_hour: 0, heaviest_kg: 0, postures: [],
  repetitive_hand: false, vibration_tools: false, pushing_pulling: false, discomfort_areas: [], discomfort_level: 0 };

export function ErgonomicsResult({ e }: { e: Ergonomics }) {
  const { t, locale } = useT();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={BAND_TONE[e.risk_level]}>{t("ergo.level", { level: t(`risk.band.${e.risk_level}` as MessageKey) })}</Badge>
        <span className="text-sm text-muted">{shortDate(e.created_at, locale)}{e.task_description ? ` · ${e.task_description}` : ""}</span>
      </div>
      {e.risk_factors.length > 0 && <p className="text-[15px]"><span className="text-muted">{t("ergo.factors")}: </span>
        {e.risk_factors.map((f) => t(`ergo.f.${f}` as MessageKey)).join(", ")}</p>}
      <ul className="list-disc space-y-1 pl-5 text-[15px]">{e.recommendations.map((r) => <li key={r}>{t(`ergo.r.${r}` as MessageKey)}</li>)}</ul>
    </div>
  );
}

function ErgonomicsCard() {
  const { t } = useT();
  const [mine, setMine] = useState<Ergonomics[] | null>(null);
  const [f, setF] = useState<ErgonomicsInput>(BLANK);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.ergonomics.list("mine").then(setMine).catch(() => setMine([])); }, []);
  const toggle = (k: "postures" | "discomfort_areas", v: string) =>
    setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.ergonomics.submit({ ...f, task_description: f.task_description?.trim() || null });
      setMine((m) => [r, ...(m ?? [])]);
      setOpen(false);
      setF(BLANK);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("capa.failed"));
    } finally {
      setBusy(false);
    }
  }

  const num = (k: "hours_per_day" | "lifts_per_hour" | "heaviest_kg", label: MessageKey, max: number) => (
    <TextField label={t(label)} type="number" min={0} max={max} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} />
  );
  const chip = (k: "postures" | "discomfort_areas", v: string, label: string) => (
    <label key={v} className={cn("inline-flex min-h-[44px] cursor-pointer items-center rounded-full border px-4 text-[15px] font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal",
      f[k].includes(v) ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:bg-sunken")}>
      <input type="checkbox" className="sr-only" checked={f[k].includes(v)} onChange={() => toggle(k, v)} />{label}
    </label>
  );

  return (
    <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">{t("ergo.title")}</h2>
          <p className="text-sm text-muted">{t("ergo.subtitle")}</p>
        </div>
        {!open && <Button variant="outline" onClick={() => setOpen(true)}>{t("ergo.start")}</Button>}
      </div>
      {open && (
        <form onSubmit={submit} className="space-y-4">
          <TextField label={t("ergo.task")} hint={t("common.optional")} value={f.task_description ?? ""} maxLength={500}
            onChange={(e) => setF({ ...f, task_description: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-3">
            {num("hours_per_day", "ergo.hours", 16)}{num("lifts_per_hour", "ergo.lifts", 500)}{num("heaviest_kg", "ergo.kg", 200)}
          </div>
          <fieldset><legend className="mb-1.5 text-sm font-semibold">{t("ergo.postures")}</legend>
            <div className="flex flex-wrap gap-2">{POSTURES.map((p) => chip("postures", p, t(`ergo.f.${p}` as MessageKey)))}</div></fieldset>
          <fieldset className="space-y-2"><legend className="mb-1.5 text-sm font-semibold">{t("ergo.alsoTrue")}</legend>
            {(["repetitive_hand", "vibration_tools", "pushing_pulling"] as const).map((k) => (
              <label key={k} className="flex min-h-[44px] items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={f[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{t(`ergo.q.${k}` as MessageKey)}</label>
            ))}</fieldset>
          <fieldset><legend className="mb-1.5 text-sm font-semibold">{t("ergo.areas")}</legend>
            <div className="flex flex-wrap gap-2">{BODY_AREAS.map((a) => chip("discomfort_areas", a, t(`ergo.a.${a}` as MessageKey)))}</div></fieldset>
          <div>
            <label htmlFor="ergo-level" className="text-sm font-semibold">{t("ergo.discomfort", { n: f.discomfort_level })}</label>
            <input id="ergo-level" type="range" min={0} max={10} value={f.discomfort_level} className="mt-2 w-full accent-[hsl(var(--signal))]"
              onChange={(e) => setF({ ...f, discomfort_level: Number(e.target.value) })} />
            <div className="flex justify-between text-xs text-muted"><span>{t("well.none")}</span><span>{t("ergo.worst")}</span></div>
          </div>
          <p className="text-sm text-muted">{t("ergo.notMedical")}</p>
          <div className="flex gap-2"><Button type="submit" loading={busy}>{t("ergo.submit")}</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button></div>
        </form>
      )}
      {!mine ? <Skeleton className="h-20" /> : mine.slice(0, 3).map((e) => <div key={e.id} className="border-t border-line pt-3"><ErgonomicsResult e={e} /></div>)}
    </Panel>
  );
}

function MyDrudgery() {
  const { t } = useT();
  const [items, setItems] = useState<Drudgery[] | null>(null);
  useEffect(() => { api.drudgery.list().then(setItems).catch(() => setItems([])); }, []);
  if (!items || items.length === 0) return null;
  return (
    <Panel className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><BatteryLow className="h-5 w-5" aria-hidden />{t("drud.mine")}</h2>
      <ul className="space-y-2">{items.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{d.task_name}</span>
          <span className="flex items-center gap-2"><span className="font-display text-xl font-bold tabular-nums">{d.score}</span>
            <Badge tone={d.level === "high" ? "danger" : d.level === "moderate" ? "caution" : "safe"}>{t(`drud.level.${d.level}` as MessageKey)}</Badge></span>
        </li>))}
      </ul>
    </Panel>
  );
}

/** /app/wellbeing */
export default function WellbeingPage() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-[32px] font-bold">{t("well.title")}</h1><p className="mt-1 text-muted">{t("well.subtitle")}</p></div>
      <CheckinCard />
      <ErgonomicsCard />
      <MyDrudgery />
    </div>
  );
}
