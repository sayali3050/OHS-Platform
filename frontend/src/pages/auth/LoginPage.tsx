import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox, TextField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/misc";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/services/api";
import { homePathFor } from "@/utils/cn";

const DEMO = [
  { role: "Worker", email: "worker@demo.com" },
  { role: "Supervisor", email: "supervisor@demo.com" },
  { role: "Admin", email: "admin@demo.com" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login(email, password, remember);
      toast.success(`Signed in as ${user.full_name}`);
      nav(from ?? homePathFor(user.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Use your work email to open your safety workspace.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <TextField label="Email" type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <div className="flex items-center justify-between">
          <Checkbox label="Keep me signed in" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <Link to="/forgot-password" className="text-[15px] font-semibold text-info hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy}>Sign in</Button>
      </form>

      <p className="mt-6 text-[15px] text-muted">
        New here? <Link to="/register" className="font-semibold text-info hover:underline">Create an account</Link>
      </p>

      <section aria-labelledby="demo-h" className="mt-10 border-t border-line pt-6">
        <h2 id="demo-h" className="font-sans text-sm font-semibold">Demo accounts</h2>
        <p className="mt-1 text-sm text-muted">Synthetic demo data. Fills the form with the documented demo password.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO.map((d) => (
            <Button key={d.email} type="button" variant="outline" size="sm"
              onClick={() => { setEmail(d.email); setPassword("Demo@1234"); setError(""); }}>
              {d.role}
            </Button>
          ))}
        </div>
      </section>
    </AuthLayout>
  );
}
