import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { PasswordField, SelectField, TextField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { api, ApiError } from "@/services/api";
import { LANGUAGES, type Department, type Language, type RegisterPayload } from "@/types/auth";

export default function RegisterPage() {
  const nav = useNavigate();
  const { t, lang } = useT();
  const [form, setForm] = useState<RegisterPayload>({
    full_name: "", email: "", password: "", employee_id: "", department_id: 0, role: "worker", phone: "",
    preferred_language: lang,
  });
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.auth.departments().then(setDepartments).catch(() => setError(t("register.deptsFailed"))); }, [t]);
  // Picking a language at the top of the page also becomes the new account's language.
  useEffect(() => { setForm((f) => ({ ...f, preferred_language: lang })); }, [lang]);

  const set = <K extends keyof RegisterPayload>(k: K) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: k === "department_id" ? Number(e.target.value) : e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFields({}); setError("");
    if (!form.department_id) { setFields({ department_id: t("register.deptRequired") }); return; }
    setBusy(true);
    try {
      const res = await api.auth.register({ ...form, phone: form.phone || undefined });
      toast.success(res.message);
      nav("/login", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(err.message); }
      else setError(t("register.failed"));
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout title={t("register.title")} subtitle={t("register.subtitle")}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        {departments?.length === 0 && <FormAlert>{t("register.noDepartments")}</FormAlert>}
        <TextField label={t("register.fullName")} autoComplete="name" required value={form.full_name} onChange={set("full_name")} error={fields.full_name} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label={t("register.employeeId")} required value={form.employee_id} onChange={set("employee_id")} error={fields.employee_id} placeholder="WRK-1234" />
          <TextField label={t("register.phone")} type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} error={fields.phone} />
        </div>
        <TextField label={t("register.workEmail")} type="email" autoComplete="email" required value={form.email} onChange={set("email")} error={fields.email} />
        <PasswordField label={t("register.password")} autoComplete="new-password" required value={form.password}
          onChange={set("password")} error={fields.password} hint={t("register.passwordHint")}
          showLabel={t("pw.show")} hideLabel={t("pw.hide")} />
        <SelectField label={t("register.department")} required value={form.department_id || ""} onChange={set("department_id")} error={fields.department_id}>
          <option value="" disabled>{t("register.chooseDepartment")}</option>
          {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </SelectField>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField label={t("register.role")} value={form.role} onChange={set("role")} error={fields.role}>
            <option value="worker">{t("role.worker")}</option>
            <option value="supervisor">{t("role.supervisor")}</option>
          </SelectField>
          <SelectField label={t("register.language")} value={form.preferred_language}
            onChange={(e) => setForm((f) => ({ ...f, preferred_language: e.target.value as Language }))}>
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.native}</option>)}
          </SelectField>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t("common.createAccount")}</Button>
      </form>
      <p className="mt-6 text-[15px] text-muted">
        {t("register.already")} <Link to="/login" className="font-semibold text-info hover:underline">{t("common.signIn")}</Link>
      </p>
    </AuthLayout>
  );
}
