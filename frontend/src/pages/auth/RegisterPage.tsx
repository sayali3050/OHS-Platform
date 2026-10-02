import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/misc";
import { api, ApiError } from "@/services/api";
import { LANGUAGES, type Department, type RegisterPayload } from "@/types/auth";

const empty: RegisterPayload = {
  full_name: "", email: "", password: "", employee_id: "", department_id: 0, role: "worker", phone: "",
  preferred_language: "en",
};

export default function RegisterPage() {
  const nav = useNavigate();
  const [form, setForm] = useState(empty);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.auth.departments().then(setDepartments).catch(() => setError("Couldn't load departments.")); }, []);

  const set = <K extends keyof RegisterPayload>(k: K) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: k === "department_id" ? Number(e.target.value) : e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFields({}); setError("");
    if (!form.department_id) { setFields({ department_id: "Choose your department" }); return; }
    setBusy(true);
    try {
      const res = await api.auth.register({ ...form, phone: form.phone || undefined });
      toast.success(res.message);
      nav("/login", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(err.message); }
      else setError("Registration failed. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Workers can start right away. Supervisor access is approved by an administrator.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <TextField label="Full name" autoComplete="name" required value={form.full_name} onChange={set("full_name")} error={fields.full_name} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Employee ID" required value={form.employee_id} onChange={set("employee_id")} error={fields.employee_id} placeholder="WRK-1234" />
          <TextField label="Phone" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} error={fields.phone} />
        </div>
        <TextField label="Work email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} error={fields.email} />
        <TextField label="Password" type="password" autoComplete="new-password" required value={form.password}
          onChange={set("password")} error={fields.password} hint="At least 8 characters, with a letter and a number." />
        <SelectField label="Department" required value={form.department_id || ""} onChange={set("department_id")} error={fields.department_id}>
          <option value="" disabled>Choose department</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </SelectField>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField label="Role" value={form.role} onChange={set("role")} error={fields.role}>
            <option value="worker">Worker</option>
            <option value="supervisor">Supervisor</option>
          </SelectField>
          <SelectField label="Preferred language" value={form.preferred_language} onChange={set("preferred_language")}>
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.native}</option>)}
          </SelectField>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-[15px] text-muted">
        Already registered? <Link to="/login" className="font-semibold text-info hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
