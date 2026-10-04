import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Building2, FileQuestion, MapPin, Pencil, Phone, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { catalogLabel } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import { RISK_LEVELS, type DepartmentCard, type DepartmentInput, type DepartmentProfile, type RiskLevel } from "@/types/people";

const RISK_TONE: Record<RiskLevel, "safe" | "caution" | "danger" | "info"> = {
  low: "safe", moderate: "info", high: "caution", critical: "danger",
};

export function RiskBadge({ level }: { level: RiskLevel | null }) {
  const { t } = useT();
  if (!level) return null;
  return <Badge tone={RISK_TONE[level]}>{t("dept.risk", { level: t(`risk.${level}` as MessageKey) })}</Badge>;
}

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={alert && value > 0 ? "rounded-md border-l-4 border-l-caution bg-sunken/50 p-3" : "rounded-md bg-sunken/50 p-3"}>
      <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

/** /app/departments */
export default function DepartmentsPage() {
  const { t } = useT();
  const { user } = useAuth();
  const [items, setItems] = useState<DepartmentCard[] | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { api.departments.list().then(setItems).catch(() => setItems([])); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] font-bold">{t("dept.title")}</h1>
          <p className="mt-1 text-muted">{t("dept.subtitle")}</p>
        </div>
        {user?.role === "admin" && !adding && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden /> {t("dept.add")}</Button>}
      </div>
      {adding && <NewDepartment onCancel={() => setAdding(false)} />}
      {!items ? <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((d) => (
            <Link key={d.id} to={`/app/departments/${d.id}`}
              className={`block rounded-lg border bg-surface p-5 transition-colors hover:bg-sunken/40 ${d.id === user?.department?.id ? "border-ink" : "border-line"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-muted">{d.code}{d.id === user?.department?.id ? ` · ${t("dept.yours")}` : ""}</p>
                  <h2 className="text-xl font-bold">{d.name}</h2>
                  <p className="mt-0.5 text-sm text-muted">{[d.building, d.head ? t("dept.headIs", { name: d.head.full_name }) : null].filter(Boolean).join(" · ")}</p>
                </div>
                <RiskBadge level={d.risk_level} />
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <Stat label={t("dept.workers")} value={d.stats.workers} />
                <Stat label={t("dept.supervisors")} value={d.stats.supervisors} />
                <Stat label={t("dept.openIncidents")} value={d.stats.open_incidents} alert />
                <Stat label={t("dept.openHazards")} value={d.stats.open_hazards} alert />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewDepartment({ onCancel }: { onCancel: () => void }) {
  const { t } = useT();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", code: "", risk_level: "moderate", building: "", locations: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api.departments.create({
        name: f.name.trim(), code: f.code.trim(), risk_level: f.risk_level as RiskLevel, building: f.building.trim() || null,
        locations: f.locations.split(",").map((s) => s.trim()).filter(Boolean),
      });
      toast.success(t("dept.created"));
      nav(`/app/departments/${d.id}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { name: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-bold">{t("dept.add")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("dept.name")} value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} maxLength={120} />
          <TextField label={t("dept.code")} hint={t("dept.codeHint")} value={f.code} onChange={(e) => set("code", e.target.value)} error={errors.code} maxLength={16} />
          <SelectField label={t("dept.riskLevel")} value={f.risk_level} onChange={(e) => set("risk_level", e.target.value)}>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{t(`risk.${r}` as MessageKey)}</option>)}
          </SelectField>
          <TextField label={t("dept.building")} value={f.building} onChange={(e) => set("building", e.target.value)} maxLength={120} />
        </div>
        <TextField label={t("dept.locations")} hint={t("dept.locationsHint")} value={f.locations} onChange={(e) => set("locations", e.target.value)} />
        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={f.name.trim().length < 2 || f.code.trim().length < 2}>{t("dept.create")}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      </form>
    </Panel>
  );
}

function Facts({ title, icon, rows }: { title: string; icon?: ReactNode; rows: [string, ReactNode][] }) {
  const { t } = useT();
  return (
    <Panel className="overflow-hidden">
      <h2 className="flex items-center gap-2 px-5 pt-4 text-lg font-bold">{icon}{title}</h2>
      <dl className="mt-2 divide-y divide-line border-t border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words font-medium">{v || <span className="font-normal text-muted">{t("common.notSet")}</span>}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function Chips({ items, tone = "neutral" }: { items: string[]; tone?: "neutral" | "caution" }) {
  if (!items.length) return null;
  return <ul className="flex flex-wrap gap-2">{items.map((s) => <li key={s}><Badge tone={tone}>{s}</Badge></li>)}</ul>;
}

/** /app/departments/:id */
export function DepartmentDetailPage() {
  const { t } = useT();
  const { user } = useAuth();
  const { id } = useParams();
  const [d, setD] = useState<DepartmentProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setD(null); setMissing(false); setEditing(false);
    api.departments.get(Number(id)).then(setD).catch(() => setMissing(true));
  }, [id]);

  const back = (
    <Link to="/app/departments" className="inline-flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {t("dept.all")}
    </Link>
  );
  if (missing) return <div className="space-y-4">{back}<Panel><EmptyState icon={<FileQuestion className="h-6 w-6" />} title={t("dept.notFound")} body="" /></Panel></div>;
  if (!d) return <div className="space-y-4">{back}<Skeleton className="h-32" /><Skeleton className="h-64" /></div>;

  const ppe = d.required_ppe.map((p) => catalogLabel(t, "ppeItem", p));
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {back}
      <Panel className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-muted">{d.code}{d.id === user?.department?.id ? ` · ${t("dept.yours")}` : ""}</p>
            <h1 className="text-[30px] font-bold leading-tight">{d.name}</h1>
            {d.description && <p className="mt-1 text-muted">{d.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge level={d.risk_level} />
            {d.can_edit && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden /> {t("dept.edit")}</Button>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label={t("dept.workers")} value={d.stats.workers} />
          <Stat label={t("dept.supervisors")} value={d.stats.supervisors} />
          <Stat label={t("dept.openIncidents")} value={d.stats.open_incidents} alert />
          <Stat label={t("dept.openHazards")} value={d.stats.open_hazards} alert />
          <Stat label={t("dept.incidents90")} value={d.stats.incidents_90d} />
        </div>
      </Panel>

      {editing ? <EditDepartment d={d} onDone={(next) => { if (next) setD(next); setEditing(false); }} /> : (
        <>
          <Panel className="space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldAlert className="h-5 w-5 text-danger" aria-hidden />{t("dept.safety")}</h2>
            <div><p className="mb-1.5 text-sm font-semibold text-muted">{t("dept.keyHazards")}</p>
              {d.key_hazards.length ? <Chips items={d.key_hazards} tone="caution" /> : <p className="text-muted">{t("common.notSet")}</p>}</div>
            <div><p className="mb-1.5 text-sm font-semibold text-muted">{t("dept.requiredPpe")}</p>
              {ppe.length ? <Chips items={ppe} /> : <p className="text-muted">{t("common.notSet")}</p>}</div>
          </Panel>
          <Facts title={t("dept.emergency")} icon={<MapPin className="h-5 w-5" aria-hidden />} rows={[
            [t("dept.assembly"), d.assembly_point], [t("dept.firstAid"), d.first_aid_point], [t("dept.fireEquipment"), d.fire_equipment],
            [t("dept.contact"), d.contact_phone ? <a className="inline-flex items-center gap-1 text-info hover:underline" href={`tel:${d.contact_phone.replace(/[^\d+]/g, "")}`}><Phone className="h-4 w-4" aria-hidden />{d.contact_phone}</a> : null],
          ]} />
          <Facts title={t("dept.work")} icon={<Building2 className="h-5 w-5" aria-hidden />} rows={[
            [t("dept.activities"), d.main_activities], [t("dept.machinery"), d.machinery], [t("dept.building"), d.building],
            [t("dept.shifts"), d.shift_pattern], [t("dept.hours"), d.working_hours],
          ]} />
          <div className="grid gap-6 md:grid-cols-2">
            <Panel className="p-5">
              <h2 className="text-lg font-bold">{t("dept.people")}</h2>
              <p className="mt-2 text-sm text-muted">{t("dept.head")}</p>
              <p className="font-semibold">{d.head?.full_name ?? t("common.notSet")}</p>
              <p className="mt-3 text-sm text-muted">{t("dept.supervisors")}</p>
              <ul className="mt-1 space-y-1">{d.supervisors.map((s) => <li key={s.id} className="font-medium">{s.full_name}</li>)}</ul>
            </Panel>
            <Panel className="p-5">
              <h2 className="text-lg font-bold">{t("dept.areas")}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">{d.locations.map((l) => <li key={l.id}><Badge>{l.name}</Badge></li>)}</ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function EditDepartment({ d, onDone }: { d: DepartmentProfile; onDone: (next?: DepartmentProfile) => void }) {
  const { t } = useT();
  const [f, setF] = useState({
    name: d.name, description: d.description ?? "", risk_level: d.risk_level ?? "", building: d.building ?? "",
    shift_pattern: d.shift_pattern ?? "", working_hours: d.working_hours ?? "", contact_phone: d.contact_phone ?? "",
    main_activities: d.main_activities ?? "", machinery: d.machinery ?? "", key_hazards: d.key_hazards.join("\n"),
    required_ppe: d.required_ppe.join("\n"), assembly_point: d.assembly_point ?? "", first_aid_point: d.first_aid_point ?? "",
    fire_equipment: d.fire_equipment ?? "", head_id: d.head ? String(d.head.id) : "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const opt = (s: string) => s.trim() || null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: DepartmentInput = {
        name: f.name.trim(), description: opt(f.description), risk_level: (f.risk_level || null) as RiskLevel | null,
        building: opt(f.building), shift_pattern: opt(f.shift_pattern), working_hours: opt(f.working_hours),
        contact_phone: opt(f.contact_phone), main_activities: opt(f.main_activities), machinery: opt(f.machinery),
        key_hazards: lines(f.key_hazards), required_ppe: lines(f.required_ppe), assembly_point: opt(f.assembly_point),
        first_aid_point: opt(f.first_aid_point), fire_equipment: opt(f.fire_equipment), head_id: f.head_id ? Number(f.head_id) : null,
      };
      onDone(await api.departments.update(d.id, body));
      toast.success(t("dept.saved"));
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); if (!Object.keys(err.fields).length) toast.error(err.message); }
    } finally {
      setBusy(false);
    }
  }

  const text = (k: keyof typeof f, label: MessageKey, max = 200) => (
    <TextField label={t(label)} value={f[k]} onChange={(e) => set(k, e.target.value)} error={errors[k]} maxLength={max} />
  );
  return (
    <form onSubmit={save} className="space-y-6">
      <Panel className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {text("name", "dept.name", 120)}
          <SelectField label={t("dept.riskLevel")} value={f.risk_level} onChange={(e) => set("risk_level", e.target.value)}>
            <option value="">{t("common.notSet")}</option>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{t(`risk.${r}` as MessageKey)}</option>)}
          </SelectField>
          <SelectField label={t("dept.head")} value={f.head_id} onChange={(e) => set("head_id", e.target.value)} error={errors.head_id}>
            <option value="">{t("common.notSet")}</option>
            {d.supervisors.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </SelectField>
          {text("building", "dept.building", 120)}
          {text("shift_pattern", "dept.shifts", 120)}
          {text("working_hours", "dept.hours", 120)}
          {text("contact_phone", "dept.contact", 32)}
        </div>
        <TextField label={t("dept.description")} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={500} />
        <TextAreaField label={t("dept.activities")} rows={3} maxLength={2000} value={f.main_activities} onChange={(e) => set("main_activities", e.target.value)} />
        <TextAreaField label={t("dept.machinery")} rows={3} maxLength={2000} value={f.machinery} onChange={(e) => set("machinery", e.target.value)} />
      </Panel>
      <Panel className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextAreaField label={t("dept.keyHazards")} hint={t("dept.onePerLine")} rows={5} value={f.key_hazards} onChange={(e) => set("key_hazards", e.target.value)} />
          <TextAreaField label={t("dept.requiredPpe")} hint={t("dept.onePerLine")} rows={5} value={f.required_ppe} onChange={(e) => set("required_ppe", e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {text("assembly_point", "dept.assembly")}
          {text("first_aid_point", "dept.firstAid")}
          {text("fire_equipment", "dept.fireEquipment", 300)}
        </div>
      </Panel>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>{t("dept.save")}</Button>
        <Button type="button" variant="outline" onClick={() => onDone()}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}
