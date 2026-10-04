import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/misc";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { api, ApiError } from "@/services/api";
import { homePathFor } from "@/utils/cn";

/** /change-password: from the profile, or forced after a temporary password (staff-created account or reset). */
export default function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const forced = !!user?.must_change_password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const eye = { showLabel: t("pw.show"), hideLabel: t("pw.hide") };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== again) { setFields({ again: t("chpw.mismatch") }); return; }
    setFields({});
    setBusy(true);
    try {
      await api.auth.changePassword(current, next);
      if (user) setUser({ ...user, must_change_password: false });
      toast.success(t("chpw.done"));
      nav(user ? homePathFor(user.role) : "/login", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); if (!Object.keys(err.fields).length) setError(err.message); }
      else setError(t("chpw.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={forced ? t("chpw.forcedTitle") : t("chpw.title")} subtitle={forced ? t("chpw.forcedBody") : t("chpw.subtitle")}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <PasswordField label={forced ? t("chpw.currentTemp") : t("chpw.current")} autoComplete="current-password" required
          value={current} onChange={(e) => setCurrent(e.target.value)} error={fields.current_password} {...eye} />
        <PasswordField label={t("chpw.new")} autoComplete="new-password" required minLength={8} value={next}
          onChange={(e) => setNext(e.target.value)} error={fields.new_password} hint={t("register.passwordHint")} {...eye} />
        <PasswordField label={t("chpw.confirm")} autoComplete="new-password" required value={again}
          onChange={(e) => setAgain(e.target.value)} error={fields.again} {...eye} />
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t("chpw.submit")}</Button>
      </form>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {forced ? (
          <Button variant="ghost" onClick={() => logout().then(() => nav("/login", { replace: true }))}>{t("chpw.signOut")}</Button>
        ) : (
          <Link to="/app/profile" className="text-[15px] font-semibold text-info hover:underline">{t("chpw.back")}</Link>
        )}
        <Link to="/app/emergency" className="inline-flex min-h-[44px] items-center gap-2 text-[15px] font-semibold text-danger hover:underline">
          <ShieldAlert className="h-5 w-5" aria-hidden /> {t("chpw.emergency")}
        </Link>
      </div>
    </AuthLayout>
  );
}
