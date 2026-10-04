import { useT } from "@/i18n";
import { severityHintKey, severityKey } from "@/i18n/labels";
import { SEVERITY_VALUES, type Severity } from "@/types/reports";
import { cn } from "@/utils/cn";

const DOT: Record<Severity, string> = { low: "bg-info", medium: "bg-caution", high: "bg-danger", critical: "bg-danger ring-4 ring-danger/25" };

/** Large radio cards: easy to hit with gloves on, and each level says what it means. */
export function SeverityPicker({ value, onChange, error, name = "severity" }: {
  value: Severity | null; onChange: (s: Severity) => void; error?: string; name?: string;
}) {
  const { t } = useT();
  return (
    <fieldset className="space-y-1.5" aria-describedby={error ? `${name}-err` : undefined}>
      <legend className="mb-1.5 text-sm font-semibold">{t("severity.question")}</legend>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {SEVERITY_VALUES.map((s) => (
          <label key={s} className={cn(
            "flex min-h-[64px] cursor-pointer items-start gap-3 rounded-md border bg-surface p-3 transition-colors",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal",
            value === s ? "border-ink ring-1 ring-ink" : error ? "border-danger" : "border-line hover:bg-sunken",
          )}>
            <input type="radio" name={name} value={s} checked={value === s} onChange={() => onChange(s)} className="sr-only" />
            <span aria-hidden className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", DOT[s])} />
            <span>
              <span className="block font-semibold">{t(severityKey(s))}</span>
              <span className="block text-sm leading-snug text-muted">{t(severityHintKey(s))}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p id={`${name}-err`} role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </fieldset>
  );
}
