import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Panel } from "@/components/ui/misc";
import { useAuth } from "@/hooks/useAuth";
import { translate, useT, type MessageKey } from "@/i18n";
import { api, ApiError } from "@/services/api";
import { LANGUAGES } from "@/types/auth";
import { BLOOD_GROUPS, GENDERS, SHIFTS, type Profile, type ProfileUpdate } from "@/types/people";
import { shortDate } from "@/utils/format";

export function ageFrom(dob: string | null, now = new Date()) {
  if (!dob) return null;
  const d = new Date(dob);
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function yearsSince(iso: string | null) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (365.25 * 86_400_000)));
}

function Section({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  const { t } = useT();
  return (
    <Panel className="overflow-hidden">
      <h2 className="px-5 pt-4 text-lg font-bold">{title}</h2>
      <dl className="mt-2 divide-y divide-line border-t border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 break-words font-medium">{v ?? <span className="font-normal text-muted">{t("common.notSet")}</span>}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

type Form = Record<keyof ProfileUpdate, string>;

const PERSONAL = ["full_name", "phone", "preferred_language", "date_of_birth", "gender", "blood_group", "address",
  "qualification", "emergency_contact_name", "emergency_contact_relation", "emergency_contact_phone", "medical_notes"] as const;
const WORK = ["designation", "date_of_joining", "experience_years", "shift"] as const;

function toForm(p: Profile): Partial<Form> {
  const out: Partial<Form> = {};
  for (const k of [...PERSONAL, ...WORK]) out[k] = p[k] == null ? "" : String(p[k]);
  return out;
}

export function DetailsTab({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const { t, locale } = useT();
  const { setUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Partial<Form>>(() => toForm(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const canPersonal = profile.is_me || profile.can_edit_work;
  const p = profile;
  const date = (iso: string | null) => (iso ? shortDate(iso, locale) : null);
  const set = (k: keyof Form, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  async function save(e: FormEvent) {
    e.preventDefault();
    const fields = [...PERSONAL, ...(p.can_edit_work ? WORK : [])];
    const before = toForm(p);
    const changes: Record<string, unknown> = {};
    for (const k of fields) {
      if (f[k] === before[k]) continue;
      const v = (f[k] ?? "").trim();
      changes[k] = k === "experience_years" ? (v === "" ? null : Number(v)) : v === "" ? null : v;
    }
    if (!Object.keys(changes).length) { setEditing(false); return; }
    setBusy(true);
    setErrors({});
    try {
      const saved = await api.people.update(p.id, changes as ProfileUpdate);
      onSaved(saved);
      if (saved.is_me) setUser(await api.auth.me());  // keeps the header name and app language in step
      setEditing(false);
      toast.success(translate(saved.preferred_language, "profile.saved"));
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); toast.error(err.message); }
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    const field = (k: keyof Form, label: MessageKey, props: Record<string, unknown> = {}, disabled = false) => (
      <TextField label={t(label)} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} error={errors[k]}
        disabled={disabled} {...props} />
    );
    const noWork = !p.can_edit_work;
    return (
      <form onSubmit={save} className="space-y-6">
        <Panel className="space-y-4 p-5">
          <h2 className="text-lg font-bold">{t("prof.personal")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("full_name", "register.fullName", { maxLength: 120 }, !canPersonal)}
            {field("phone", "register.phone", { type: "tel", maxLength: 32 }, !canPersonal)}
            {field("date_of_birth", "prof.dob", { type: "date" }, !canPersonal)}
            <SelectField label={t("prof.gender")} value={f.gender ?? ""} onChange={(e) => set("gender", e.target.value)} disabled={!canPersonal}>
              <option value="">{t("common.notSet")}</option>
              {GENDERS.map((g) => <option key={g} value={g}>{t(`gender.${g}` as MessageKey)}</option>)}
            </SelectField>
            <SelectField label={t("prof.bloodGroup")} value={f.blood_group ?? ""} onChange={(e) => set("blood_group", e.target.value)}
              error={errors.blood_group} disabled={!canPersonal}>
              <option value="">{t("common.notSet")}</option>
              {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
            </SelectField>
            <SelectField label={t("register.language")} value={f.preferred_language ?? "en"} hint={t("profile.languageHint")}
              onChange={(e) => set("preferred_language", e.target.value)} disabled={!canPersonal}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.native} ({l.label})</option>)}
            </SelectField>
            {field("qualification", "prof.qualification", { maxLength: 200 }, !canPersonal)}
          </div>
          <TextField label={t("prof.address")} value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} maxLength={300} disabled={!canPersonal} />
        </Panel>

        <Panel className="space-y-4 p-5">
          <h2 className="text-lg font-bold">{t("prof.employment")}</h2>
          {noWork && <p className="text-sm text-muted">{t("prof.workLocked")}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("designation", "prof.designation", { maxLength: 120 }, noWork)}
            {field("date_of_joining", "prof.joined", { type: "date" }, noWork)}
            {field("experience_years", "prof.experience", { type: "number", min: 0, max: 60 }, noWork)}
            <SelectField label={t("prof.shift")} value={f.shift ?? ""} onChange={(e) => set("shift", e.target.value)} disabled={noWork || !p.shift}>
              {!p.shift && <option value="">{t("common.notSet")}</option>}
              {SHIFTS.map((s) => <option key={s} value={s}>{t(`shift.${s}` as MessageKey)}</option>)}
            </SelectField>
          </div>
        </Panel>

        <Panel className="space-y-4 p-5">
          <h2 className="text-lg font-bold">{t("prof.emergencyContact")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {field("emergency_contact_name", "prof.ecName", { maxLength: 120 }, !canPersonal)}
            {field("emergency_contact_relation", "prof.ecRelation", { maxLength: 60 }, !canPersonal)}
            {field("emergency_contact_phone", "prof.ecPhone", { type: "tel", maxLength: 32 }, !canPersonal)}
          </div>
          <TextAreaField label={t("prof.medical")} hint={t("prof.medicalHint")} rows={3} maxLength={1000}
            value={f.medical_notes ?? ""} onChange={(e) => set("medical_notes", e.target.value)} disabled={!canPersonal} />
        </Panel>

        <div className="flex gap-2">
          <Button type="submit" loading={busy}>{t("profile.save")}</Button>
          <Button type="button" variant="outline" onClick={() => { setF(toForm(p)); setErrors({}); setEditing(false); }}>{t("common.cancel")}</Button>
        </div>
      </form>
    );
  }

  const age = ageFrom(p.date_of_birth);
  const tenure = yearsSince(p.date_of_joining);
  return (
    <div className="space-y-6">
      {canPersonal && (
        <Button variant="outline" onClick={() => { setF(toForm(p)); setEditing(true); }}>
          <Pencil className="h-4 w-4" aria-hidden /> {t("prof.edit")}
        </Button>
      )}
      <Section title={t("prof.personal")} rows={[
        [t("register.fullName"), p.full_name],
        [t("prof.dob"), p.date_of_birth ? `${date(p.date_of_birth)} (${t("prof.age", { n: age ?? 0 })})` : null],
        [t("prof.gender"), p.gender ? t(`gender.${p.gender}` as MessageKey) : null],
        [t("prof.bloodGroup"), p.blood_group],
        [t("register.phone"), p.phone ? <a className="text-info hover:underline" href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>{p.phone}</a> : null],
        [t("register.workEmail"), p.email],
        [t("prof.address"), p.address],
        [t("prof.qualification"), p.qualification],
        [t("register.language"), LANGUAGES.find((l) => l.value === p.preferred_language)?.native],
      ]} />
      <Section title={t("prof.employment")} rows={[
        [t("register.employeeId"), p.employee_id],
        [t("prof.designation"), p.designation],
        [t("register.department"), p.department ? <Link className="text-info hover:underline" to={`/app/departments/${p.department.id}`}>{p.department.name}</Link> : null],
        [t("prof.supervisor"), p.supervisor?.full_name],
        [t("prof.shift"), p.shift ? t(`shift.${p.shift}` as MessageKey) : null],
        [t("prof.joined"), p.date_of_joining ? `${date(p.date_of_joining)} (${t("prof.years", { n: tenure ?? 0 })})` : null],
        [t("prof.experience"), p.experience_years != null ? t("prof.years", { n: p.experience_years }) : null],
        [t("prof.workplace"), p.primary_location?.name],
        [t("prof.lastLogin"), p.last_login_at ? date(p.last_login_at) : null],
      ]} />
      <Section title={t("prof.emergencyContact")} rows={[
        [t("prof.ecName"), p.emergency_contact_name],
        [t("prof.ecRelation"), p.emergency_contact_relation],
        [t("prof.ecPhone"), p.emergency_contact_phone ? <a className="text-info hover:underline" href={`tel:${p.emergency_contact_phone.replace(/[^\d+]/g, "")}`}>{p.emergency_contact_phone}</a> : null],
        [t("prof.medical"), p.medical_notes],
      ]} />
    </div>
  );
}
