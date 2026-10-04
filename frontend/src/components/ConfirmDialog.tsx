import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

interface Props {
  open: boolean; title: string; body: ReactNode; confirmLabel: string;
  tone?: "primary" | "danger"; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}

/** Native <dialog>: focus trapping, Esc to close and inert background come for free. */
export function ConfirmDialog({ open, title, body, confirmLabel, tone = "primary", busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useT();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel(); }} aria-labelledby="confirm-title"
      className="w-[min(92vw,440px)] rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-black/50">
      <div className="p-6">
        <h2 id="confirm-title" className="text-xl font-bold">{title}</h2>
        <div className="mt-2 text-muted">{body}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line bg-sunken/50 px-6 py-4">
        <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button variant={tone} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
      </div>
    </dialog>
  );
}
