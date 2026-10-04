import type { MessageKey } from "@/i18n/en";
import type { HazardCategory, HazardStatus, IncidentCategory, IncidentStatus, Priority, Severity } from "@/types/reports";

/** Typed key builders, so enum values from the API map to dictionary entries in one place. */
export const severityKey = (s: Severity) => `severity.${s}` as MessageKey;
export const severityHintKey = (s: Severity) => `severity.${s}Hint` as MessageKey;
export const priorityKey = (p: Priority) => `priority.${p}` as MessageKey;
export const incidentCategoryKey = (c: IncidentCategory | null) => `icat.${c ?? "other"}` as MessageKey;
export const hazardCategoryKey = (c: HazardCategory) => `hcat.${c}` as MessageKey;
export const statusKey = (s: IncidentStatus | HazardStatus, kind: "incident" | "hazard") =>
  `${kind === "incident" ? "istatus" : "hstatus"}.${s}` as MessageKey;
export const roleKey = (r: string) => `role.${r}` as MessageKey;

/** PPE items and course titles come from the database in English; known ones are translated, others shown as-is. */
export function catalogLabel(t: (k: MessageKey) => string, prefix: "ppeItem" | "course", name: string) {
  const key = `${prefix}.${name}` as MessageKey;
  const out = t(key);
  return out === key ? name : out;
}
