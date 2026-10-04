import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { api, ApiError } from "@/services/api";
import type { Profile } from "@/types/people";

/** Your own profile: change password. Someone you manage: give them a temporary password (no email needed). */
export function PasswordActions({ profile }: { profile: Profile }) {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);

  if (profile.is_me) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/change-password"><KeyRound className="h-4 w-4" aria-hidden /> {t("prof.changePassword")}</Link>
      </Button>
    );
  }
  if (!profile.can_edit_work) return null;

  async function reset() {
    setBusy(true);
    try {
      setTemp((await api.people.resetPassword(profile.id)).temporary_password);
      setAsking(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("pwreset.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(temp ?? ""); toast.success(t("pwreset.copied")); } catch { /* the text stays on screen */ }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
        <KeyRound className="h-4 w-4" aria-hidden /> {t("pwreset.button")}
      </Button>
      <ConfirmDialog open={asking} title={t("pwreset.confirmTitle", { name: profile.full_name })} body={t("pwreset.confirmBody")}
        confirmLabel={t("pwreset.confirm")} tone="danger" busy={busy} onConfirm={reset} onCancel={() => setAsking(false)} />
      {temp && (
        <div role="status" className="w-full space-y-2 rounded-md border-l-4 border-caution bg-caution/10 px-4 py-3">
          <p className="font-semibold">{t("pwreset.shownTitle", { name: profile.full_name })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-surface px-3 py-1.5 font-mono text-xl font-bold tracking-wider">{temp}</code>
            <Button size="sm" variant="ghost" onClick={copy}><Copy className="h-4 w-4" aria-hidden /> {t("pwreset.copy")}</Button>
          </div>
          <p className="text-sm text-muted">{t("pwreset.shownBody")}</p>
          <Button size="sm" variant="secondary" onClick={() => setTemp(null)}>{t("pwreset.done")}</Button>
        </div>
      )}
    </>
  );
}
