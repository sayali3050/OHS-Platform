import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { HeartPulse, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useT, type MessageKey } from "@/i18n";
import { api, ApiError } from "@/services/api";
import { CHECK_TYPES, HEALTH_RESULTS, type HealthCheck, type HealthCheckInput, type HealthResult, type Profile } from "@/types/people";
import { shortDate } from "@/utils/format";

export const RESULT_TONE: Record<HealthResult, "safe" | "caution" | "danger"> = {
  fit: "safe", fit_with_restrictions: "caution", temporarily_unfit: "danger", unfit: "danger",
};

const today = () => new Date().toISOString().slice(0, 10);
const inAYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };

function AddCheck({ userId, onAdded, onCancel }: { userId: number; onAdded: (c: HealthCheck) => void; onCancel: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({ check_type: "periodic", checked_on: today(), result: "fit", blood_pressure: "", pulse: "",
    vision: "", hearing: "", examiner: "", notes: "", next_due_on: inAYear() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };
  const opt = (v: string) => v.trim() || null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: HealthCheckInput = {
        check_type: f.check_type as HealthCheckInput["check_type"], checked_on: f.checked_on,
        result: f.result as HealthResult, blood_pressure: opt(f.blood_pressure), pulse: f.pulse ? Number(f.pulse) : null,
        vision: opt(f.vision), hearing: opt(f.hearing), examiner: opt(f.examiner), notes: opt(f.notes),
        next_due_on: opt(f.next_due_on),
      };
      onAdded(await api.people.addHealthCheck(userId, body));
      toast.success(t("health.added"));
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); if (!Object.keys(err.fields).length) toast.error(err.message); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-4 p-5">
      <h2 className="text-lg font-bold">{t("health.add")}</h2>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label={t("health.type")} value={f.check_type} onChange={(e) => set("check_type", e.target.value)}>
            {CHECK_TYPES.map((c) => <option key={c} value={c}>{t(`health.type.${c}` as MessageKey)}</option>)}
          </SelectField>
          <TextField label={t("health.date")} type="date" max={today()} value={f.checked_on} onChange={(e) => set("checked_on", e.target.value)} error={errors.checked_on} />
          <SelectField label={t("health.result")} value={f.result} onChange={(e) => set("result", e.target.value)}>
            {HEALTH_RESULTS.map((r) => <option key={r} value={r}>{t(`health.result.${r}` as MessageKey)}</option>)}
          </SelectField>
          <TextField label={t("health.bp")} placeholder="120/80" value={f.blood_pressure} onChange={(e) => set("blood_pressure", e.target.value)} error={errors.blood_pressure} />
          <TextField label={t("health.pulse")} type="number" min={20} max={250} value={f.pulse} onChange={(e) => set("pulse", e.target.value)} error={errors.pulse} />
          <TextField label={t("health.vision")} placeholder="6/6" value={f.vision} onChange={(e) => set("vision", e.target.value)} maxLength={40} />
          <TextField label={t("health.hearing")} value={f.hearing} onChange={(e) => set("hearing", e.target.value)} maxLength={40} />
          <TextField label={t("health.examiner")} value={f.examiner} onChange={(e) => set("examiner", e.target.value)} maxLength={120} />
          <TextField label={t("health.nextDue")} type="date" value={f.next_due_on} onChange={(e) => set("next_due_on", e.target.value)} error={errors.next_due_on} />
        </div>
        <TextAreaField label={t("health.notes")} hint={t("health.notesHint")} rows={2} maxLength={1000} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>{t("health.save")}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      </form>
    </Panel>
  );
}

export function HealthTab({ profile }: { profile: Profile }) {
  const { t, locale } = useT();
  const [items, setItems] = useState<HealthCheck[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<HealthCheck | null>(null);
  useEffect(() => { api.people.healthChecks(profile.id).then(setItems).catch(() => setItems([])); }, [profile.id]);

  const latest = items?.[0];
  const due = items?.find((c) => c.next_due_on)?.next_due_on ?? null;
  const overdue = due !== null && due < today();

  async function remove() {
    if (!removing) return;
    await api.people.deleteHealthCheck(profile.id, removing.id).catch(() => toast.error(t("users.updateFailed")));
    setItems((l) => l?.filter((c) => c.id !== removing.id) ?? null);
    setRemoving(null);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t("health.privacy")}</p>
      {items && latest && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Panel className="p-4">
            <p className="text-sm text-muted">{t("health.currentFitness")}</p>
            <div className="mt-1"><Badge tone={RESULT_TONE[latest.result]}>{t(`health.result.${latest.result}` as MessageKey)}</Badge></div>
          </Panel>
          <Panel className="p-4">
            <p className="text-sm text-muted">{t("health.lastCheck")}</p>
            <p className="mt-1 font-semibold">{shortDate(latest.checked_on, locale)}</p>
          </Panel>
          <Panel className={overdue ? "border-l-4 border-l-danger p-4" : "p-4"}>
            <p className="text-sm text-muted">{t("health.nextDue")}</p>
            <p className="mt-1 font-semibold">{due ? shortDate(due, locale) : t("common.notSet")}
              {overdue && <span className="ml-2 text-sm font-bold text-danger">{t("health.overdue")}</span>}</p>
          </Panel>
        </div>
      )}
      {profile.can_manage_health && !adding && (
        <Button variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden /> {t("health.add")}</Button>
      )}
      {adding && <AddCheck userId={profile.id} onCancel={() => setAdding(false)}
        onAdded={(c) => { setItems((l) => [c, ...(l ?? [])].sort((a, b) => b.checked_on.localeCompare(a.checked_on))); setAdding(false); }} />}

      {!items ? <Skeleton className="h-40" /> : items.length === 0 ? (
        <Panel><EmptyState icon={<HeartPulse className="h-6 w-6" />} title={t("health.none")} body={t("health.noneBody")} /></Panel>
      ) : (
        <ol className="space-y-3">
          {items.map((c) => (
            <li key={c.id}>
              <Panel className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{t(`health.type.${c.check_type}` as MessageKey)}</p>
                    <p className="text-sm text-muted">{shortDate(c.checked_on, locale)}{c.examiner ? ` · ${c.examiner}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={RESULT_TONE[c.result]}>{t(`health.result.${c.result}` as MessageKey)}</Badge>
                    {profile.can_manage_health && (
                      <Button variant="ghost" size="icon" aria-label={t("health.delete")} onClick={() => setRemoving(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  {([["health.bp", c.blood_pressure], ["health.pulse", c.pulse], ["health.vision", c.vision],
                    ["health.hearing", c.hearing]] as [MessageKey, string | number | null][]).filter(([, v]) => v != null).map(([k, v]) => (
                    <div key={k}><dt className="text-muted">{t(k)}</dt><dd className="font-medium">{v}</dd></div>
                  ))}
                </dl>
                {c.notes && <p className="mt-2 text-[15px]">{c.notes}</p>}
                {(c.next_due_on || c.recorded_by_name) && (
                  <p className="mt-2 text-sm text-muted">
                    {c.next_due_on ? t("health.nextOn", { date: shortDate(c.next_due_on, locale) }) : ""}
                    {c.next_due_on && c.recorded_by_name ? " · " : ""}
                    {c.recorded_by_name ? t("health.recordedBy", { name: c.recorded_by_name }) : ""}
                  </p>
                )}
              </Panel>
            </li>
          ))}
        </ol>
      )}
      <ConfirmDialog open={!!removing} title={t("health.deleteTitle")} body={t("health.deleteBody")} tone="danger"
        confirmLabel={t("health.delete")} onConfirm={remove} onCancel={() => setRemoving(null)} />
    </div>
  );
}
