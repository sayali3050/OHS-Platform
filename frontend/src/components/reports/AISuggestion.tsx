import { useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { useT } from "@/i18n";

/** "Suggest from my description" button plus the suggestion card. The worker always decides: nothing is
 * applied until they press "Use this", and the card says it's an AI suggestion to check. */
export function AISuggestion<S extends { reasoning: string; demo_mode: boolean }>({ description, fetch, render, onApply }: {
  description: string;
  fetch: (description: string) => Promise<S>;
  render: (s: S) => ReactNode;
  onApply: (s: S) => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<S | null>(null);
  const [message, setMessage] = useState("");

  async function ask() {
    setMessage("");
    if (description.trim().length < 10) { setMessage(t("sug.needText")); return; }
    setBusy(true);
    try { setSuggestion(await fetch(description.trim())); }
    catch { setMessage(t("sug.failed")); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={ask} loading={busy}>
        {!busy && <Sparkles className="h-4 w-4" aria-hidden />} {t("sug.button")}
      </Button>
      {message && <p role="status" className="text-sm text-muted">{message}</p>}
      {suggestion && (
        <div role="region" aria-label={t("sug.title")} className="rounded-md border border-info/40 bg-info/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-info" aria-hidden />
            <span className="font-semibold">{t("sug.title")}</span>
            <Badge tone="info">{suggestion.demo_mode ? t("common.demoAi") : t("common.liveAi")}</Badge>
          </div>
          <div className="mt-3 space-y-1.5 text-[15px]">{render(suggestion)}</div>
          <p className="mt-2 text-sm text-muted">{suggestion.reasoning}</p>
          <p className="mt-1 text-sm font-medium text-muted">{t("sug.check")}</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" variant="secondary"
              onClick={() => { onApply(suggestion); setSuggestion(null); setMessage(t("sug.applied")); }}>
              {t("sug.apply")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>{t("common.dismiss")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
