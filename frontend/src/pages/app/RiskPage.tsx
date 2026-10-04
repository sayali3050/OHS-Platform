import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Pencil, Plus, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LocationPicker } from "@/components/reports/LocationPicker";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { api, ApiError } from "@/services/api";
import { CONTROL_LEVELS, type ControlLevel } from "@/types/people";
import { bandOf, EXPOSURES, type Band, type Risk, type RiskInput } from "@/types/assess";
import { cn } from "@/utils/cn";
import { shortDate } from "@/utils/format";

// Risk bands use the status colours (they are states, not series) and always print the number and label too.
export const BAND_CELL: Record<Band, string> = {
  low: "bg-safe/15 text-ink", moderate: "bg-info/15 text-ink", high: "bg-caution/25 text-ink", critical: "bg-danger/25 text-ink",
};
export const BAND_TONE: Record<Band, "safe" | "info" | "caution" | "danger"> = {
  low: "safe", moderate: "info", high: "caution", critical: "danger",
};

/** 5x5 likelihood x severity matrix with counts. Clicking a cell filters the register to it. */
function Matrix({ counts, active, onPick }: {
  counts: number[][]; active: { l: number; s: number } | null; onPick: (cell: { l: number; s: number } | null) => void;
}) {
  const { t } = useT();
  return (
    <figure>
      <table className="w-full table-fixed border-separate border-spacing-1 text-center">
        <caption className="sr-only">{t("risk.matrix")}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-24 text-xs font-semibold text-muted">{t("risk.sevLik")}</th>
            {[1, 2, 3, 4, 5].map((l) => <th key={l} scope="col" className="text-xs font-semibold text-muted">{t(`risk.l${l}` as MessageKey)}</th>)}
          </tr>
        </thead>
        <tbody>
          {counts.map((row, i) => {
            const s = 5 - i;
            return (
              <tr key={s}>
                <th scope="row" className="text-right text-xs font-semibold text-muted">{t(`risk.s${s}` as MessageKey)}</th>
                {row.map((n, j) => {
                  const l = j + 1;
                  const band = bandOf(l * s);
                  const on = active?.l === l && active?.s === s;
                  return (
                    <td key={l} className="p-0">
                      <button type="button" onClick={() => onPick(on ? null : { l, s })} aria-pressed={on}
                        className={cn("flex h-14 w-full flex-col items-center justify-center rounded-md transition-shadow",
                          BAND_CELL[band], on && "ring-2 ring-ink")}>
                        <span aria-hidden className="font-display text-xl font-bold tabular-nums">{n || ""}</span>
                        <span aria-hidden className="text-[11px] font-semibold text-ink">{l * s}</span>
                        <span className="sr-only">{t("risk.cellLabel", { l, s, score: l * s, n })}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
        {(["low", "moderate", "high", "critical"] as Band[]).map((b) => (
          <span key={b} className="flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded-sm", BAND_CELL[b])} />{t(`risk.band.${b}` as MessageKey)}</span>
        ))}
      </figcaption>
    </figure>
  );
}

function Scale({ label, value, onChange, prefix }: { label: string; value: number; onChange: (n: number) => void; prefix: "l" | "s" }) {
  const { t } = useT();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={cn("flex min-h-[56px] cursor-pointer flex-col items-center justify-center rounded-md border px-1 text-center text-xs font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal",
            value === n ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:bg-sunken")}>
            <input type="radio" className="sr-only" checked={value === n} onChange={() => onChange(n)} name={prefix} />
            <span className="font-display text-lg">{n}</span>{t(`risk.${prefix}${n}` as MessageKey)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RiskForm({ initial, onDone }: { initial: Risk | null; onDone: (r?: Risk) => void }) {
  const { t } = useT();
  const { user } = useAuth();
  const [f, setF] = useState<RiskInput>(() => initial ? {
    title: initial.title, location_id: initial.location?.id ?? null, likelihood: initial.likelihood,
    severity_score: initial.severity_score, affected_workers: initial.affected_workers, exposure_frequency: initial.exposure_frequency,
    existing_controls: initial.existing_controls, recommended_controls: initial.recommended_controls, review_due: initial.review_due,
  } : { title: "", location_id: null, likelihood: 3, severity_score: 3, affected_workers: 1, exposure_frequency: "daily",
    existing_controls: "", recommended_controls: [], review_due: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const score = f.likelihood * f.severity_score;
  const set = <K extends keyof RiskInput>(k: K, v: RiskInput[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { ...f, existing_controls: f.existing_controls?.trim() || null,
      recommended_controls: f.recommended_controls.filter((c) => c.measure.trim().length >= 3) };
    try {
      const saved = initial ? await api.risks.update(initial.id, body) : await api.risks.create(body);
      toast.success(t("risk.saved"));
      onDone(saved);
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); if (!Object.keys(err.fields).length) toast.error(err.message); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-5">
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{initial ? t("risk.edit") : t("risk.add")}</h2>
          <Button type="button" variant="ghost" size="icon" aria-label={t("common.cancel")} onClick={() => onDone()}><X className="h-5 w-5" /></Button>
        </div>
        <TextField label={t("risk.titleLabel")} hint={t("risk.titleHint")} value={f.title} onChange={(e) => set("title", e.target.value)} error={errors.title} maxLength={200} />
        <LocationPicker value={f.location_id} onChange={(id) => set("location_id", id)} defaultDepartmentId={user?.department?.id} error={errors.location_id} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Scale label={t("risk.likelihood")} value={f.likelihood} onChange={(n) => set("likelihood", n)} prefix="l" />
          <Scale label={t("risk.severity")} value={f.severity_score} onChange={(n) => set("severity_score", n)} prefix="s" />
        </div>
        <p role="status" className={cn("rounded-md px-4 py-3 font-semibold", BAND_CELL[bandOf(score)])}>
          {t("risk.preview", { l: f.likelihood, s: f.severity_score, score, band: t(`risk.band.${bandOf(score)}` as MessageKey) })}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label={t("risk.exposure")} value={f.exposure_frequency ?? ""} onChange={(e) => set("exposure_frequency", (e.target.value || null) as RiskInput["exposure_frequency"])}>
            {EXPOSURES.map((x) => <option key={x} value={x}>{t(`risk.exp.${x}` as MessageKey)}</option>)}
          </SelectField>
          <TextField label={t("risk.affected")} type="number" min={0} value={String(f.affected_workers)} onChange={(e) => set("affected_workers", Number(e.target.value) || 0)} />
          <TextField label={t("risk.review")} type="date" value={f.review_due ?? ""} onChange={(e) => set("review_due", e.target.value || null)} />
        </div>
        <TextAreaField label={t("risk.existing")} rows={2} maxLength={2000} value={f.existing_controls ?? ""} onChange={(e) => set("existing_controls", e.target.value)} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">{t("risk.planned")}</legend>
          <p className="text-sm text-muted">{t("capa.controlHint")}</p>
          {f.recommended_controls.map((c, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor={`cl-${i}`}>{t("capa.control")}</label>
              <select id={`cl-${i}`} value={c.level} className="h-11 rounded-md border border-line bg-surface px-3 text-[15px]"
                onChange={(e) => set("recommended_controls", f.recommended_controls.map((x, j) => j === i ? { ...x, level: e.target.value as ControlLevel } : x))}>
                {CONTROL_LEVELS.map((l) => <option key={l} value={l}>{t(`capa.level.${l}` as MessageKey)}</option>)}
              </select>
              <label className="sr-only" htmlFor={`cm-${i}`}>{t("capa.description")}</label>
              <input id={`cm-${i}`} value={c.measure} maxLength={300} placeholder={t("capa.description")}
                className="h-11 flex-1 rounded-md border border-line bg-surface px-3 text-[15px]"
                onChange={(e) => set("recommended_controls", f.recommended_controls.map((x, j) => j === i ? { ...x, measure: e.target.value } : x))} />
              <Button type="button" variant="ghost" size="icon" aria-label={t("capa.remove")}
                onClick={() => set("recommended_controls", f.recommended_controls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => set("recommended_controls", [...f.recommended_controls, { level: "engineering", measure: "" }])}>
            <Plus className="h-4 w-4" aria-hidden /> {t("risk.addControl")}
          </Button>
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={f.title.trim().length < 3}>{t("risk.save")}</Button>
          <Button type="button" variant="outline" onClick={() => onDone()}>{t("common.cancel")}</Button>
        </div>
      </form>
    </Panel>
  );
}

function RiskCard({ r, onEdit, onChange, onRemove }: { r: Risk; onEdit: () => void; onChange: (r: Risk) => void; onRemove: () => void }) {
  const { t, locale } = useT();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{r.title}</p>
          <p className="text-sm text-muted">{[r.location?.name ?? r.department?.name, r.exposure_frequency ? t(`risk.exp.${r.exposure_frequency}` as MessageKey) : null,
            t("risk.people", { n: r.affected_workers }), r.hazard?.reference].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("rounded-md px-2.5 py-1 text-sm font-bold tabular-nums", BAND_CELL[r.risk_level])}>
            {r.likelihood}×{r.severity_score} = {r.risk_score}</span>
          <Badge tone={BAND_TONE[r.risk_level]}>{t(`risk.band.${r.risk_level}` as MessageKey)}</Badge>
        </div>
      </div>
      {r.existing_controls && <p className="text-[15px]"><span className="text-muted">{t("risk.existing")}: </span>{r.existing_controls}</p>}
      {r.recommended_controls.length > 0 && (
        <ul className="space-y-1">{r.recommended_controls.map((c, i) => (
          <li key={i} className="flex gap-2 text-[15px]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden />
            <span>{c.measure} <span className="text-sm text-muted">({t(`capa.level.${c.level}` as MessageKey)})</span></span></li>))}
        </ul>
      )}
      {r.ai_explanation && (
        <p className="rounded-md border border-info/40 bg-info/5 px-3 py-2 text-[15px]">
          <Sparkles className="mr-1 inline h-4 w-4 text-info" aria-hidden />{r.ai_explanation}
          <span className="mt-1 block text-xs font-medium text-muted">{t("ai.marker")}</span></p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {r.review_due && <span className={r.review_overdue ? "font-semibold text-danger" : ""}>{t(r.review_overdue ? "risk.reviewOverdue" : "risk.reviewOn", { date: shortDate(r.review_due, locale) })}</span>}
        {r.assessed_by && <span>· {t("risk.by", { name: r.assessed_by.full_name })}</span>}
        <span className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" loading={busy} onClick={async () => { setBusy(true); try { onChange(await api.risks.explain(r.id)); } catch { toast.error(t("rca.failed")); } finally { setBusy(false); } }}>
            {!busy && <Sparkles className="h-4 w-4" aria-hidden />} {t("risk.explain")}</Button>
          {r.can_edit && <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" aria-hidden /> {t("prof.edit")}</Button>}
          {r.can_edit && <Button size="icon" variant="ghost" aria-label={t("risk.remove")} onClick={() => setRemoving(true)}><Trash2 className="h-4 w-4" /></Button>}
        </span>
      </div>
      <ConfirmDialog open={removing} title={t("risk.removeTitle")} body={r.title} tone="danger" confirmLabel={t("risk.remove")}
        onCancel={() => setRemoving(false)} onConfirm={async () => { await api.risks.remove(r.id).catch(() => {}); setRemoving(false); onRemove(); }} />
    </li>
  );
}

/** /app/risk: the department's risk register. Everyone can read it; supervisors and admins maintain it. */
export default function RiskPage() {
  const { t } = useT();
  const { user } = useAuth();
  const staff = user?.role !== "worker";
  const [items, setItems] = useState<Risk[] | null>(null);
  const [counts, setCounts] = useState<number[][] | null>(null);
  const [cell, setCell] = useState<{ l: number; s: number } | null>(null);
  const [editing, setEditing] = useState<Risk | "new" | null>(null);
  const load = () => {
    api.risks.list(cell ? { likelihood: cell.l, severity: cell.s } : {}).then(setItems).catch(() => setItems([]));
    api.risks.matrix({}).then(setCounts).catch(() => {});
  };
  useEffect(load, [cell]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] font-bold">{t("risk.title")}</h1>
          <p className="mt-1 text-muted">{t(staff ? "risk.subtitle" : "risk.subtitleWorker")}</p>
        </div>
        {staff && !editing && <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden /> {t("risk.add")}</Button>}
      </div>
      {editing && <RiskForm initial={editing === "new" ? null : editing} onDone={(saved) => { setEditing(null); if (saved) load(); }} />}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel className="p-5">
          <h2 className="mb-3 text-lg font-bold">{t("risk.matrix")}</h2>
          {counts ? <Matrix counts={counts} active={cell} onPick={setCell} /> : <Skeleton className="h-72" />}
          {cell && <Button variant="link" size="sm" onClick={() => setCell(null)}>{t("common.clearFilters")}</Button>}
        </Panel>
        <Panel className="overflow-hidden">
          <h2 className="px-5 pt-4 text-lg font-bold">{t("risk.register")} {items && <span className="text-base font-normal text-muted">({items.length})</span>}</h2>
          {!items ? <div className="space-y-2 p-4"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
            : items.length === 0 ? <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={t("risk.empty")} body={t("risk.emptyBody")} /> : (
            <ul className="mt-2 divide-y divide-line border-t border-line">
              {items.map((r) => <RiskCard key={r.id} r={r} onEdit={() => { setEditing(r); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                onChange={(n) => setItems((l) => l?.map((x) => (x.id === n.id ? n : x)) ?? null)} onRemove={load} />)}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
