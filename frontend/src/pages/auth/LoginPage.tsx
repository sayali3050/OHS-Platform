import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox, PasswordField, TextField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/misc";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { api, ApiError } from "@/services/api";
import { homePathFor } from "@/utils/cn";

const DEMO = [
  { role: "role.worker", email: "worker@demo.com" },
  { role: "role.supervisor", email: "supervisor@demo.com" },
  { role: "role.admin", email: "admin@demo.com" },
] as const;

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Demo shortcuts only on a demo install; a real site shows just the sign-in form.
  const [demo, setDemo] = useState(false);
  useEffect(() => { api.systemInfo().then((i) => setDemo(i.demo_data)).catch(() => {}); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login(email, password, remember);
      toast.success(t("login.welcome", { name: user.full_name }));
      nav(user.must_change_password ? "/change-password" : from ?? homePathFor(user.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("login.title")} subtitle={t("login.subtitle")}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <TextField label={t("login.email")} type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label={t("login.password")} autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} showLabel={t("pw.show")} hideLabel={t("pw.hide")} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox label={t("login.remember")} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <Link to="/forgot-password" className="text-[15px] font-semibold text-info hover:underline">{t("login.forgot")}</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t("login.title")}</Button>
      </form>

      <p className="mt-6 text-[15px] text-muted">
        {t("login.newHere")} <Link to="/register" className="font-semibold text-info hover:underline">{t("login.createLink")}</Link>
      </p>

      {demo && <section aria-labelledby="demo-h" className="mt-10 border-t border-line pt-6">
        <h2 id="demo-h" className="font-sans text-sm font-semibold">{t("login.demoTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("login.demoBody")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO.map((d) => (
            <Button key={d.email} type="button" variant="outline" size="sm"
              onClick={() => { setEmail(d.email); setPassword("Demo@1234"); setError(""); }}>
              {t(d.role)}
            </Button>
          ))}
        </div>
      </section>}
    </AuthLayout>
  );
}
