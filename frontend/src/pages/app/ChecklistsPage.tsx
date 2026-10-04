import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { LocationPicker } from "@/components/reports/LocationPicker";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { api, ApiError } from "@/services/api";
import type { Checklist, ChecklistResult } from "@/types/assess";
import { cn } from "@/utils/cn";
import { dateTime } from "@/utils/format";

type Ans = "yes" | "no" | "na";

/** Fill in one checklist. Each "No" offers a one-tap hazard report, prefilled with what was found. */
function Runner({ c, onDone }: { c: Checklist; onDone: (r: ChecklistResult) => void }) {
  const { t } = useT();
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Record<number, { answer: Ans | null; note: string }>>(
    () => Object.fromEntries(c.items.map((i) => [i.id, { answer: null, note: "" }])));
  const [loc, setLoc] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const all = c.items.every((i) => answers[i.id].answer);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await api.checklists.complete(c.id, { location_id: loc, answers: c.items.map((i) => ({
        item_id: i.id, answer: answers[i.id].answer!, note: answers[i.id].note.trim() || null })) }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("capa.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-t border-line p-4">
      <LocationPicker value={loc} onChange={setLoc} defaultDepartmentId={user?.department?.id} />
      <ol className="space-y-3">
        {c.items.map((i, n) => {
          const a = answers[i.id];
          return (
            <li key={i.id}>
              <fieldset>
                <legend className="font-semibold">{n + 1}. {i.text}</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(["yes", "no", "na"] as Ans[]).map((v) => (
                    <label key={v} className={cn("inline-flex min-h-[44px] min-w-[72px] cursor-pointer items-center justify-center rounded-md border px-4 font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal",
                      a.answer === v ? (v === "no" ? "border-danger bg-danger-solid text-white" : v === "yes" ? "border-safe bg-safe-solid text-white" : "border-ink bg-ink text-bg")
                        : "border-line bg-surface hover:bg-sunken")}>
                      <input type="radio" className="sr-only" name={`i${c.id}-${i.id}`} checked={a.answer === v}
                        onChange={() => setAnswers((x) => ({ ...x, [i.id]: { ...x[i.id], answer: v } }))} />{t(`chk.${v}`)}
                    </label>
                  ))}
                </div>
                {a.answer === "no" && (
                  <TextField label={t("chk.whatsWrong")} className="mt-2" value={a.note} maxLength={300}
                    onChange={(e) => setAnswers((x) => ({ ...x, [i.id]: { ...x[i.id], note: e.target.value } }))} />
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>
      <Button type="submit" loading={busy} disabled={!all}>{t("chk.submit")}</Button>
    </form>
  );
}

function Done({ r }: { r: ChecklistResult }) {
  const { t } = useT();
  if (!r.failed_items) return <p className="flex items-center gap-2 p-4 font-semibold text-safe"><CheckCircle2 className="h-5 w-5" aria-hidden />{t("chk.allGood")}</p>;
  return (
    <div className="space-y-2 border-t border-line p-4">
      <p className="font-semibold">{t("chk.problems", { n: r.failed_items })}</p>
      <ul className="space-y-1.5">{r.hazard_prompts.map((p) => (
        <li key={p} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-caution/10 px-3 py-2">
          <span>{p}</span>
          <Button asChild size="sm" variant="secondary"><Link to={`/app/report/hazard?description=${encodeURIComponent(`${r.checklist}: ${p}`)}`}>
            <TriangleAlert className="h-4 w-4" aria-hidden /> {t("chk.report")}</Link></Button>
        </li>))}</ul>
    </div>
  );
}

function Editor({ onSaved, onCancel }: { onSaved: (c: Checklist) => void; onCancel: () => void }) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [items, setItems] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const valid = title.trim().length >= 3 && items.some((i) => i.trim().length >= 3);
  return (
    <Panel className="space-y-4 p-5">
      <h2 className="text-lg font-bold">{t("chk.new")}</h2>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <TextField label={t("chk.name")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <SelectField label={t("chk.frequency")} value={frequency} onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}>
          <option value="daily">{t("chk.daily")}</option><option value="weekly">{t("chk.weekly")}</option>
        </SelectField>
      </div>
      <fieldset className="space-y-2"><legend className="text-sm font-semibold">{t("chk.items")}</legend>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <label className="sr-only" htmlFor={`item-${i}`}>{t("chk.item", { n: i + 1 })}</label>
            <input id={`item-${i}`} value={it} maxLength={200} placeholder={t("chk.itemPh")}
              className="h-11 flex-1 rounded-md border border-line bg-surface px-3 text-[15px]"
              onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
            <Button type="button" variant="ghost" size="icon" aria-label={t("capa.remove")} onClick={() => setItems((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setItems((l) => [...l, ""])}><Plus className="h-4 w-4" aria-hidden /> {t("chk.addItem")}</Button>
      </fieldset>
      <div className="flex gap-2">
        <Button loading={busy} disabled={!valid} onClick={async () => {
          setBusy(true);
          try { onSaved(await api.checklists.create({ title: title.trim(), frequency, items: items.filter((i) => i.trim().length >= 3).map((text) => ({ text: text.trim() })) })); toast.success(t("chk.saved")); }
          catch (e) { toast.error(e instanceof ApiError ? e.message : t("capa.failed")); }
          finally { setBusy(false); }
        }}>{t("chk.save")}</Button>
        <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </Panel>
  );
}

function TeamResults() {
  const { t, locale } = useT();
  const [rows, setRows] = useState<ChecklistResult[] | null>(null);
  const [failedOnly, setFailedOnly] = useState(true);
  useEffect(() => { setRows(null); api.checklists.results({ failed_only: failedOnly || undefined }).then(setRows).catch(() => setRows([])); }, [failedOnly]);
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-lg font-bold">{t("chk.recent")}</h2>
        <label className="flex min-h-[44px] items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={failedOnly}
          onChange={(e) => setFailedOnly(e.target.checked)} />{t("chk.failedOnly")}</label>
      </div>
      {!rows ? <div className="p-5"><Skeleton className="h-24" /></div> : rows.length === 0 ? <p className="px-5 pb-5 text-muted">{t("rec.none")}</p> : (
        <ul className="mt-2 divide-y divide-line border-t border-line">{rows.slice(0, 50).map((r) => (
          <li key={r.id} className="px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{r.checklist} <span className="font-normal text-muted">· {r.user.full_name}{r.location ? ` · ${r.location}` : ""}</span></p>
              <span className="flex items-center gap-2 text-sm text-muted">{dateTime(r.completed_at, locale)}
                <Badge tone={r.failed_items ? "danger" : "safe"}>{r.failed_items ? t("chk.nNo", { n: r.failed_items }) : t("chk.allYes")}</Badge></span>
            </div>
            {r.hazard_prompts.length > 0 && <ul className="mt-1 list-disc pl-5 text-[15px]">{r.hazard_prompts.map((p) => <li key={p}>{p}</li>)}</ul>}
          </li>))}</ul>
      )}
    </Panel>
  );
}

/** /app/checklists */
export default function ChecklistsPage() {
  const { t } = useT();
  const { user } = useAuth();
  const staff = user?.role !== "worker";
  const [params] = useSearchParams();
  const [lists, setLists] = useState<Checklist[] | null>(null);
  const [open, setOpen] = useState<number | null>(params.get("open") ? Number(params.get("open")) : null);
  const [done, setDone] = useState<Record<number, ChecklistResult>>({});
  const [creating, setCreating] = useState(false);
  useEffect(() => { api.checklists.list().then(setLists).catch(() => setLists([])); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-[32px] font-bold">{t("chk.title")}</h1><p className="mt-1 text-muted">{t("chk.subtitle")}</p></div>
        {staff && !creating && <Button variant="outline" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> {t("chk.new")}</Button>}
      </div>
      {creating && <Editor onCancel={() => setCreating(false)} onSaved={(c) => { setLists((l) => [...(l ?? []), c]); setCreating(false); }} />}
      {!lists ? <Skeleton className="h-40" /> : lists.length === 0 ? <Panel><EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title={t("chk.none")} body="" /></Panel> : (
        <ul className="space-y-3">
          {lists.map((c) => (
            <li key={c.id}>
              <Panel className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-sm text-muted">{t(c.frequency === "daily" ? "chk.daily" : "chk.weekly")} · {t("chk.nItems", { n: c.items.length })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(c.done_this_period || done[c.id]) && <Badge tone="safe">{t(c.frequency === "daily" ? "chk.doneToday" : "chk.doneWeek")}</Badge>}
                    {open !== c.id && !done[c.id] && <Button size="sm" variant={c.done_this_period ? "outline" : "primary"} onClick={() => setOpen(c.id)}>{t("chk.start")}</Button>}
                  </div>
                </div>
                {done[c.id] ? <Done r={done[c.id]} /> : open === c.id && (
                  <Runner c={c} onDone={(r) => { setDone((d) => ({ ...d, [c.id]: r })); setOpen(null); setLists((l) => l?.map((x) => (x.id === c.id ? { ...x, done_this_period: true } : x)) ?? null); }} />
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}
      {staff && <TeamResults />}
    </div>
  );
}
