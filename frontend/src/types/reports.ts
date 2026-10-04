import type { Language } from "@/types/auth";

export type Severity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "reported" | "assigned" | "investigating" | "corrective_action" | "verification" | "closed";
export type HazardStatus = "open" | "in_review" | "controlled" | "closed";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Scope = "own" | "department" | "all";
export type HazardCategory =
  | "unsafe_machine" | "slippery_floor" | "exposed_wire" | "missing_ppe" | "excessive_noise" | "poor_lighting"
  | "chemical_leak" | "unsafe_lifting" | "fire_hazard" | "blocked_exit" | "ergonomic" | "other";
export type IncidentCategory =
  | "near_miss" | "slip_trip_fall" | "fall_from_height" | "struck_by" | "caught_in_machinery" | "manual_handling"
  | "cut_laceration" | "burn" | "chemical_exposure" | "electrical" | "vehicle" | "other";

export interface PersonRef { id: number; full_name: string }
export interface PlaceRef { id: number; name: string }
export interface AttachmentRef { id: number; original_filename: string; content_type: string; size_bytes: number }

export interface IncidentSummary {
  id: number; reference: string; title: string; category: IncidentCategory | null; severity: Severity;
  status: IncidentStatus; occurred_at: string; created_at: string; injury_occurred: boolean;
  department: PlaceRef | null; location: PlaceRef | null; reporter: PersonRef | null;
}
export interface Incident extends IncidentSummary {
  description: string; original_language: Language; original_description: string | null;
  injury_details: string | null; people_involved: string | null; investigator: PersonRef | null;
  attachments: AttachmentRef[]; can_manage: boolean; allowed_transitions: IncidentStatus[];
  root_cause: string | null; root_cause_suggestion: RootCauseSuggestion | null;
}

export interface RootCauseSuggestion {
  whys: { question: string; answer: string }[]; root_cause: string; contributing_factors: string[];
  suggested_actions: { description: string; control_level: string }[]; confidence: "low" | "medium" | "high";
  demo_mode: boolean; at: string;
}

export interface HazardSummary {
  id: number; reference: string; category: HazardCategory; description: string; severity: Severity;
  priority: Priority; status: HazardStatus; is_anonymous: boolean; created_at: string;
  department: PlaceRef | null; location: PlaceRef | null; reporter: PersonRef | null;
}
export interface Hazard extends HazardSummary {
  original_language: Language; original_description: string | null; attachments: AttachmentRef[];
  can_manage: boolean; allowed_transitions: HazardStatus[];
}

export interface ActivityItem {
  id: number; action: "create" | "assign" | "status" | string; actor: string | null; at: string;
  from_status: string | null; to_status: string | null; note: string | null; investigator: string | null;
}

export interface AIMessage {
  id: number; role: "user" | "assistant"; content: string;
  classification: "emergency" | "medical_concern" | "safety_guidance" | null; demo_mode: boolean; created_at: string;
  sources?: { document_id: number; title: string; heading: string | null; chunk_id: number; snippet: string }[] | null;
}
export interface AIConversationSummary { id: number; title: string; updated_at: string }
export interface AIConversation extends AIConversationSummary { messages: AIMessage[] }
export interface HazardSuggestion {
  category: HazardCategory; severity: Severity; reasoning: string; keywords: string[]; demo_mode: boolean;
}
export interface IncidentSuggestion {
  title: string; category: IncidentCategory; severity: Severity; injury_likely: boolean; reasoning: string;
  keywords: string[]; demo_mode: boolean;
}

export interface ReportPage<T> { items: T[]; total: number; page: number; page_size: number; scope: Scope }

export interface IncidentInput {
  title: string; description: string; category: IncidentCategory; severity: Severity; occurred_at: string;
  location_id: number | null; injury_occurred: boolean; injury_details: string | null; people_involved: string | null;
}
export interface HazardInput {
  category: HazardCategory; description: string; severity: Severity; location_id: number | null;
  is_anonymous: boolean;
}

export interface DepartmentWithLocations { id: number; name: string; code: string; locations: PlaceRef[] }

export interface Notification {
  id: number; kind: string; priority: "info" | "warning" | "critical"; title: string; body: string | null;
  link: string | null; read_at: string | null; created_at: string;
}

export interface EmergencyInfo {
  first_step: string;
  contacts: { label: string; phone: string; kind: "site" | "supervisor" | "public" }[];
  contacts_configured: boolean;
  guides: { type: EmergencyType; label: string; steps: string[] }[];
}
export type EmergencyType = "fire" | "medical" | "chemical_spill" | "machinery" | "electrical" | "other";

export interface WorkerDashboard {
  score: number | null;
  band: "good" | "fair" | "needs_attention" | null;
  method: string;
  components: { key: "ppe" | "training" | "checklists"; label: string; score: number; weight: number; explanation: string }[];
  checklists: { done_days: number; days: number };
  ppe: { name: string; issued_on: string; replace_by: string; status: "ok" | "due_soon" | "overdue" | "damaged" | "missing"; compliant: boolean }[];
  training: { course_id: number; title: string; category: string; mandatory: boolean;
    status: "valid" | "expiring" | "expired" | "in_progress" | "not_started"; completion_pct: number;
    expires_on: string | null; current: boolean }[];
  reports: {
    open_incidents: number; open_hazards: number;
    recent: ((IncidentSummary & { kind: "incident" }) | (HazardSummary & { kind: "hazard" }))[];
  };
}

/* ---- value lists in display order; labels come from the i18n dictionaries ---- */

export const SEVERITY_VALUES: Severity[] = ["low", "medium", "high", "critical"];
export const INCIDENT_CATEGORY_VALUES: IncidentCategory[] = [
  "near_miss", "slip_trip_fall", "fall_from_height", "struck_by", "caught_in_machinery", "manual_handling",
  "cut_laceration", "burn", "chemical_exposure", "electrical", "vehicle", "other",
];
export const HAZARD_CATEGORY_VALUES: HazardCategory[] = [
  "unsafe_machine", "slippery_floor", "exposed_wire", "missing_ppe", "excessive_noise", "poor_lighting",
  "chemical_leak", "unsafe_lifting", "fire_hazard", "blocked_exit", "ergonomic", "other",
];
export const INCIDENT_FLOW: IncidentStatus[] = ["reported", "assigned", "investigating", "corrective_action", "verification", "closed"];
export const HAZARD_FLOW: HazardStatus[] = ["open", "in_review", "controlled", "closed"];
