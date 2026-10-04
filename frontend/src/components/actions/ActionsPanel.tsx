import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Panel, Skeleton } from "@/components/ui/misc";
import { ActionItem } from "@/components/actions/ActionItem";
import { useT, type MessageKey } from "@/i18n";
import { priorityKey } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import { CONTROL_LEVELS, type ActionKind, type CapaAction, type ControlLevel } from "@/types/people";
import type { PersonRef } from "@/types/reports";

const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function AddAction({ report, onAdded, onCancel }: {
  report: { kind: "incident" | "hazard"; id: number }; onAdded: (a: CapaAction) => void; onCancel: () => void;
}) {
  const { t } = useT();
  const [people, setPeople] = useState<PersonRef[]>([]);
  const [f, setF] = useState({ kind: "corrective", description: "", control_level: "", responsible_id: "", due_date: inDays(14), priority: "medium" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const key = report.kind === "incident" ? "incident_id" : "hazard_id";
  useEffect(() => { api.actions.people({ [key]: report.id }).then(setPeople).catch(() => {}); }, [key, report.id]);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onAdded(await api.actions.create({
        kind: f.kind as ActionKind, [key]: report.id, description: f.description.trim(),
        control_level: (f.control_level || null) as ControlLevel | null,
        responsible_id: f.responsible_id ? Number(f.responsible_id) : null, due_date: f.due_date,
        priority: f.priority as CapaAction["priority"],
      }));
      toast.success(t("capa.added"));
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { description: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-t border-line p-4">
      <TextAreaField label={t("capa.description")} hint={t("capa.descriptionHint")} rows={2} maxLength={2000}
        value={f.description} onChange={(e) => set("description", e.target.value)} error={errors.description} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label={t("capa.type")} value={f.kind} onChange={(e) => set("kind", e.target.value)}>
          <option value="corrective">{t("capa.kind.corrective")}</option>
          <option value="preventive">{t("capa.kind.preventive")}</option>
        </SelectField>
        <SelectField label={t("capa.control")} hint={t("capa.controlHint")} value={f.control_level} onChange={(e) => set("control_level", e.target.value)}>
          <option value="">{t("common.notSet")}</option>
          {CONTROL_LEVELS.map((c) => <option key={c} value={c}>{t(`capa.level.${c}` as MessageKey)}</option>)}
        </SelectField>
        <SelectField label={t("capa.responsible")} value={f.responsible_id} onChange={(e) => set("responsible_id", e.target.value)} error={errors.responsible_id}>
          <option value="">{t("capa.noOwner")}</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </SelectField>
        <TextField label={t("capa.dueDate")} type="date" min={inDays(0)} value={f.due_date} onChange={(e) => set("due_date", e.target.value)} error={errors.due_date} />
        <SelectField label={t("detail.priority")} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
          {(["low", "medium", "high", "urgent"] as const).map((p) => <option key={p} value={p}>{t(priorityKey(p))}</option>)}
        </SelectField>
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={f.description.trim().length < 5}>{t("capa.add")}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}

/** Corrective and preventive actions on a report. Managers add them; owners complete them. */
export function ActionsPanel({ report, canManage, closed }: {
  report: { kind: "incident" | "hazard"; id: number }; canManage: boolean; closed: boolean;
}) {
  const { t } = useT();
  const [items, setItems] = useState<CapaAction[] | null>(null);
  const [adding, setAdding] = useState(false);
  const key = report.kind === "incident" ? "incident_id" : "hazard_id";
  useEffect(() => {
    api.actions.list({ [key]: report.id, scope: "team", state: "all", page_size: 100 })
      .then((p) => setItems(p.items)).catch(() => setItems([]));
  }, [key, report.id]);

  const replace = (a: CapaAction) => setItems((l) => l?.map((x) => (x.id === a.id && x.kind === a.kind ? a : x)) ?? null);
  const open = items?.filter((a) => a.state !== "completed").length ?? 0;

  if (items && items.length === 0 && !canManage) return null;
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><ListChecks className="h-5 w-5" aria-hidden />{t("capa.title")}</h2>
          {items && items.length > 0 && <p className="text-sm text-muted">{t("capa.summary", { open, total: items.length })}</p>}
        </div>
        {canManage && !closed && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden /> {t("capa.add")}</Button>
        )}
      </div>
      {report.kind === "incident" && canManage && <p className="px-5 pt-1 text-sm text-muted">{t("capa.gate")}</p>}
      {adding && <AddAction report={report} onCancel={() => setAdding(false)}
        onAdded={(a) => { setItems((l) => [...(l ?? []), a]); setAdding(false); }} />}
      {!items ? <div className="p-5"><Skeleton className="h-16" /></div> : items.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-muted">{t("capa.none")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {items.map((a) => <li key={`${a.kind}-${a.id}`}>
            <ActionItem action={a} onChange={replace}
              onRemove={(r) => setItems((l) => l?.filter((x) => !(x.id === r.id && x.kind === r.kind)) ?? null)} />
          </li>)}
        </ul>
      )}
    </Panel>
  );
}
