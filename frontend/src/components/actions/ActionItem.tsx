import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useT, type MessageKey } from "@/i18n";
import { priorityKey } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import type { ActionState, CapaAction } from "@/types/people";
import { cn } from "@/utils/cn";
import { shortDate } from "@/utils/format";

export const STATE_TONE: Record<ActionState, "neutral" | "info" | "safe" | "danger"> = {
  pending: "neutral", in_progress: "info", completed: "safe", overdue: "danger",
};

/** One corrective or preventive action. The responsible person (or a manager) moves it along and completes it. */
export function ActionItem({ action, onChange, onRemove, showReport }: {
  action: CapaAction; onChange: (a: CapaAction) => void; onRemove?: (a: CapaAction) => void; showReport?: boolean;
}) {
  const { t, locale } = useT();
  const [completing, setCompleting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const a = action;

  async function update(state: "in_progress" | "completed") {
    setBusy(true);
    setError("");
    try {
      onChange(await api.actions.update(a.kind, a.id, { state, ...(state === "completed" ? { completion_note: note.trim() } : {}) }));
      if (state === "completed") { setCompleting(false); toast.success(t("capa.completed")); }
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields.completion_note ?? e.message) : t("capa.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api.actions.remove(a.kind, a.id);
      onRemove?.(a);
    } catch {
      toast.error(t("capa.failed"));
    }
    setRemoving(false);
  }

  return (
    <div className={cn("space-y-2 p-4", a.state === "overdue" && "border-l-4 border-l-danger")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{a.description}</p>
          <p className="text-sm text-muted">
            {[t(`capa.kind.${a.kind}` as MessageKey), a.control_level ? t(`capa.level.${a.control_level}` as MessageKey) : null,
              a.responsible ? t("capa.owner", { name: a.responsible.full_name }) : t("capa.noOwner"),
              t("capa.due", { date: shortDate(a.due_date, locale) })].filter(Boolean).join(" · ")}
          </p>
          {showReport && a.report && (
            <Link to={`/app/reports/${a.report.kind === "incident" ? "incidents" : "hazards"}/${a.report.id}`}
              className="text-sm font-semibold text-info hover:underline">
              {a.report.reference}{a.report.kind === "incident" ? `: ${a.report.title}` : ""}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(a.priority === "high" || a.priority === "urgent") && <Badge tone="caution">{t(priorityKey(a.priority))}</Badge>}
          <Badge tone={STATE_TONE[a.state]}>{t(`capa.state.${a.state}` as MessageKey)}</Badge>
          {a.can_edit && (
            <Button variant="ghost" size="icon" aria-label={t("capa.remove")} onClick={() => setRemoving(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {a.state === "completed" && a.completion_note && (
        <p className="text-[15px]"><CheckCircle2 className="mr-1 inline h-4 w-4 text-safe" aria-hidden />“{a.completion_note}”
          {a.completed_at && <span className="text-sm text-muted"> · {shortDate(a.completed_at, locale)}</span>}</p>
      )}
      {a.can_progress && a.state !== "completed" && !completing && (
        <div className="flex flex-wrap gap-2">
          {a.state === "pending" && (
            <Button size="sm" variant="outline" loading={busy} onClick={() => update("in_progress")}>
              <Play className="h-4 w-4" aria-hidden /> {t("capa.start")}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setCompleting(true)}>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {t("capa.markDone")}
          </Button>
        </div>
      )}
      {completing && (
        <div className="space-y-2 rounded-md bg-sunken/50 p-3">
          <TextAreaField label={t("capa.whatDone")} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
            error={error || undefined} />
          <div className="flex gap-2">
            <Button size="sm" loading={busy} disabled={!note.trim()} onClick={() => update("completed")}>{t("capa.confirmDone")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setCompleting(false)}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}
      {!completing && error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <ConfirmDialog open={removing} title={t("capa.removeTitle")} body={a.description} tone="danger"
        confirmLabel={t("capa.remove")} onConfirm={remove} onCancel={() => setRemoving(false)} />
    </div>
  );
}
