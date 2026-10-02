import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/misc";
import { api, ApiError } from "@/services/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { setSent((await api.auth.forgotPassword(email)).message); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : "Request failed"); }
    finally { setBusy(false); }
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your work email and we'll send a reset link.">
      {sent ? (
        <div className="space-y-4">
          <p className="rounded-md border-l-4 border-safe bg-safe/10 px-4 py-3 font-medium">{sent}</p>
          <p className="text-sm text-muted">In the local development setup, the link is printed in the backend logs instead of being emailed.</p>
          <Link to="/login" className="font-semibold text-info hover:underline">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <TextField label="Work email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="lg" className="w-full" loading={busy}>Send reset link</Button>
          <Link to="/login" className="block text-[15px] font-semibold text-info hover:underline">Back to sign in</Link>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const token = useSearchParams()[0].get("token") ?? "";
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [error, setError] = useState(token ? "" : "This reset link is missing its token. Request a new one.");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api.auth.resetPassword(token, pw);
      toast.success("Password changed. Sign in with your new password.");
      nav("/login", { replace: true });
    } catch (err) { setError(err instanceof ApiError ? err.message : "Reset failed"); }
    finally { setBusy(false); }
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Reset links work once and expire after 30 minutes.">
      <form onSubmit={submit} className="space-y-5">
        {error && <FormAlert>{error}</FormAlert>}
        <TextField label="New password" type="password" autoComplete="new-password" required minLength={8}
          value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 8 characters, with a letter and a number." />
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!token}>Change password</Button>
      </form>
    </AuthLayout>
  );
}
