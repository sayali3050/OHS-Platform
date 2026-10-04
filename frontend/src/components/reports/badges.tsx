import { Check } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { severityKey, statusKey } from "@/i18n/labels";
import { HAZARD_FLOW, INCIDENT_FLOW, type HazardStatus, type IncidentStatus, type Severity } from "@/types/reports";
import { cn } from "@/utils/cn";

const SEVERITY_TONE = { low: "info", medium: "caution", high: "danger" } as const;

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useT();
  if (severity === "critical") {
    return <span className="inline-flex items-center rounded-sm bg-danger-solid px-2 py-0.5 text-[13px] font-bold text-white">{t("severity.critical")}</span>;
  }
  return <Badge tone={SEVERITY_TONE[severity]}>{t(severityKey(severity))}</Badge>;
}

export function StatusBadge({ status, kind }: { status: IncidentStatus | HazardStatus; kind: "incident" | "hazard" }) {
  const { t } = useT();
  const tone = status === "closed" || status === "controlled" ? "safe" : status === "reported" || status === "open" ? "info" : "neutral";
  return <Badge tone={tone}>{t(statusKey(status, kind))}</Badge>;
}

/** Where a report is in its workflow. */
export function StatusSteps({ kind, status }: { kind: "incident" | "hazard"; status: IncidentStatus | HazardStatus }) {
  const { t } = useT();
  const flow: (IncidentStatus | HazardStatus)[] = kind === "incident" ? INCIDENT_FLOW : HAZARD_FLOW;
  const at = flow.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2" aria-label={t("steps.label")}>
      {flow.map((s, i) => {
        const done = i < at || status === "closed";
        const current = i === at && status !== "closed";
        return (
          <li key={s} className="flex items-center gap-1" aria-current={current ? "step" : undefined}>
            <span className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold",
              done ? "border-safe/30 bg-safe/10 text-safe" : current ? "border-ink bg-ink text-bg" : "border-line text-muted",
            )}>
              {done && <Check className="h-3.5 w-3.5" aria-hidden />}
              {t(statusKey(s, kind))}
              {done && <span className="sr-only"> {t("steps.done")}</span>}
              {current && <span className="sr-only"> {t("steps.current")}</span>}
            </span>
            {i < flow.length - 1 && <span aria-hidden className="h-px w-3 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}
