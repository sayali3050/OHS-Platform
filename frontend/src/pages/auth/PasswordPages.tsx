import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { api, ApiError } from "@/services/api";

export function ForgotPasswordPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { setSent((await api.auth.forgotPassword(email)).message); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : t("forgot.failed")); }
    finally { setBusy(false); }
  }

  return (
    <AuthLayout title={t("forgot.title")} subtitle={t("forgot.subtitle")}>
      {sent ? (
        <div className="space-y-4">
          <p className="rounded-md border-l-4 border-safe bg-safe/10 px-4 py-3 font-medium">{sent}</p>
          <p className="text-sm text-muted">{t("forgot.noEmail")}</p>
          <Link to="/login" className="font-semibold text-info hover:underline">{t("forgot.back")}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <TextField label={t("register.workEmail")} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="lg" className="w-full" loading={busy}>{t("forgot.send")}</Button>
          <p className="text-sm text-muted">{t("forgot.noEmail")}</p>
          <Link to="/login" className="block text-[15px] font-semibold text-info hover:underline">{t("forgot.back")}</Link>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useT();
  const token = useSearchParams()[0].get("token") ?? "";
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [error, setError] = useState(token ? "" : t("reset.missingToken"));
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api.auth.resetPassword(token, pw);
      toast.success(t("reset.done"));
      nav("/login", { replace: true });
    } catch (err) { setError(err instanceof ApiError ? err.message : t("reset.failed")); }
    finally { setBusy(false); }
  }

  return (
    <AuthLayout title={t("reset.title")} subtitle={t("reset.subtitle")}>
      <form onSubmit={submit} className="space-y-5">
        {error && <FormAlert>{error}</FormAlert>}
        <PasswordField label={t("reset.newPassword")} autoComplete="new-password" required minLength={8}
          value={pw} onChange={(e) => setPw(e.target.value)} hint={t("register.passwordHint")}
          showLabel={t("pw.show")} hideLabel={t("pw.hide")} />
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!token}>{t("reset.submit")}</Button>
      </form>
    </AuthLayout>
  );
}
