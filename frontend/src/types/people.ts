import type { Department, Language, Role } from "@/types/auth";
import type { EmergencyType, HazardSummary, IncidentSummary, PersonRef, PlaceRef, WorkerDashboard } from "@/types/reports";

export type Shift = "morning" | "evening" | "night";
export type Gender = "female" | "male" | "other" | "prefer_not_to_say";
export type HealthResult = "fit" | "fit_with_restrictions" | "temporarily_unfit" | "unfit";
export type CheckType = "pre_employment" | "periodic" | "return_to_work" | "hearing" | "vision" | "lung_function"
  | "blood_test" | "other";
export type RiskLevel = "low" | "moderate" | "high" | "critical";

export const SHIFTS: Shift[] = ["morning", "evening", "night"];
export const GENDERS: Gender[] = ["female", "male", "other", "prefer_not_to_say"];
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const HEALTH_RESULTS: HealthResult[] = ["fit", "fit_with_restrictions", "temporarily_unfit", "unfit"];
export const CHECK_TYPES: CheckType[] = ["periodic", "pre_employment", "return_to_work", "hearing", "vision",
  "lung_function", "blood_test", "other"];
export const RISK_LEVELS: RiskLevel[] = ["low", "moderate", "high", "critical"];

export interface PersonalDetails {
  full_name: string; phone: string | null; preferred_language: Language; date_of_birth: string | null;
  gender: Gender | null; blood_group: string | null; address: string | null; qualification: string | null;
  emergency_contact_name: string | null; emergency_contact_relation: string | null;
  emergency_contact_phone: string | null; medical_notes: string | null;
}
export interface WorkDetails {
  designation: string | null; date_of_joining: string | null; experience_years: number | null;
  shift: Shift | null; is_active: boolean;
}

export interface Profile extends PersonalDetails, WorkDetails {
  id: number; email: string; employee_id: string; role: Role; department: Department | null;
  supervisor: PersonRef | null; primary_location: PlaceRef | null; last_login_at: string | null; created_at: string;
  is_me: boolean; can_edit_work: boolean; can_manage_health: boolean;
}
export type ProfileUpdate = Partial<PersonalDetails & WorkDetails & { department_id: number; supervisor_id: number }>;

export interface PersonSummary {
  id: number; full_name: string; employee_id: string; email: string; role: Role; department: string | null;
  designation: string | null; phone: string | null; shift: Shift | null; is_active: boolean;
  last_check_result: HealthResult | null; next_check_due: string | null;
}
export interface PersonInput {
  full_name: string; email: string; employee_id: string; password: string; role: "worker" | "supervisor";
  department_id: number | null; phone: string | null; preferred_language: Language; designation: string | null;
  date_of_joining: string | null; shift: Shift | null;
}

export interface HealthCheckInput {
  check_type: CheckType; checked_on: string; result: HealthResult; blood_pressure: string | null;
  pulse: number | null; vision: string | null; hearing: string | null; examiner: string | null;
  notes: string | null; next_due_on: string | null;
}
export interface HealthCheck extends HealthCheckInput { id: number; recorded_by_name: string | null; created_at: string }

export interface WorkHistoryInput {
  employer: string; role_title: string; from_date: string | null; to_date: string | null; notes: string | null;
}
export interface WorkHistory extends WorkHistoryInput { id: number }

export interface PersonRecords {
  incidents: IncidentSummary[]; hazards: HazardSummary[]; ppe: WorkerDashboard["ppe"];
  training: WorkerDashboard["training"]; emergencies_raised: number;
}

/* ---- departments ---- */
export interface DepartmentStats {
  workers: number; supervisors: number; open_incidents: number; open_hazards: number; incidents_90d: number;
}
export interface DepartmentCard {
  id: number; name: string; code: string; description: string | null; risk_level: RiskLevel | null;
  building: string | null; head: PersonRef | null; stats: DepartmentStats;
}
export interface DepartmentProfile extends DepartmentCard {
  shift_pattern: string | null; working_hours: string | null; contact_phone: string | null;
  main_activities: string | null; machinery: string | null; key_hazards: string[]; required_ppe: string[];
  assembly_point: string | null; first_aid_point: string | null; fire_equipment: string | null;
  locations: PlaceRef[]; supervisors: PersonRef[]; can_edit: boolean;
}
export type DepartmentInput = Partial<Omit<DepartmentProfile,
  "id" | "code" | "head" | "stats" | "locations" | "supervisors" | "can_edit">> & { head_id?: number | null };

/* ---- emergency alarm ---- */
export interface RollCallCounts { safe: number; need_help: number; no_answer: number; total: number }
export interface ActiveEmergency {
  id: number; type: EmergencyType; label: string; steps: string[]; where: string; raised_by: string | null;
  raised_by_me: boolean; notes: string | null; created_at: string; my_response: "safe" | "need_help" | null;
  can_resolve: boolean; incident_id: number | null; counts: RollCallCounts | null;
}
export interface RollCallPerson {
  id: number; full_name: string; role: Role; phone: string | null; department: string | null;
  status: "safe" | "need_help" | null; responded_at: string | null;
}
export interface SiteContact { id: number; label: string; phone: string }

/* ---- admin overview ---- */
export interface AdminDashboard {
  kpis: {
    open_incidents: number; open_hazards: number; critical_open: number; incidents_this_month: number;
    incidents_last_month: number; injuries_90d: number; days_since_injury: number | null; overdue_actions: number;
    anonymous_hazards_90d: number;
  };
  trend: { month: string; incidents: number; hazards: number; injuries: number }[];
  open_by_severity: Record<"low" | "medium" | "high" | "critical", number>;
  hazard_categories: { category: string; count: number }[];
  ppe: { ok: number; due_soon: number; overdue: number; damaged: number; compliance: number | null };
  training: { compliance: number | null; gaps: number };
  departments: {
    id: number; name: string; code: string; risk_level: RiskLevel | null; workers: number; open_incidents: number;
    open_hazards: number; incidents_90d: number; ppe_compliance: number | null; training_compliance: number | null;
  }[];
  health: { overdue: number; due_30d: number; restricted: number; never_checked: number };
  emergencies: {
    active: ({ id: number; type: EmergencyType; created_at: string; raised_by: string | null } & RollCallCounts)[];
    recent: { id: number; type: EmergencyType; created_at: string; resolved_at: string | null; incident_id: number | null }[];
  };
  system: { ai_mode: "demo" | "live"; ai_model: string | null; demo_data: boolean };
}

/* ---- phase 3: CAPA, board, search, audit, supervisor KPIs ---- */
export type ActionKind = "corrective" | "preventive";
export type ActionState = "pending" | "in_progress" | "completed" | "overdue";
export type ControlLevel = "elimination" | "substitution" | "engineering" | "administrative" | "ppe";
export const CONTROL_LEVELS: ControlLevel[] = ["elimination", "substitution", "engineering", "administrative", "ppe"];

export interface CapaAction {
  id: number; kind: ActionKind; description: string; control_level: ControlLevel | null;
  priority: "low" | "medium" | "high" | "urgent"; due_date: string; state: ActionState; completed_at: string | null;
  completion_note: string | null; responsible: PersonRef | null;
  report: { kind: "incident" | "hazard"; id: number; reference: string; title: string; department_id: number | null } | null;
  can_edit: boolean; can_progress: boolean; created_at: string;
}
export interface ActionPage { items: CapaAction[]; total: number; page: number; page_size: number;
  counts: { open: number; overdue: number; completed: number } }
export interface ActionInput {
  kind: ActionKind; incident_id?: number; hazard_id?: number; description: string; control_level: ControlLevel | null;
  responsible_id: number | null; due_date: string; priority: CapaAction["priority"];
}
export type ActionUpdate = Partial<Omit<ActionInput, "kind" | "incident_id" | "hazard_id">> & {
  state?: "pending" | "in_progress" | "completed"; completion_note?: string | null;
};

export interface BoardCard {
  id: number; reference: string; title: string; severity: "low" | "medium" | "high" | "critical";
  status: "reported" | "assigned" | "investigating" | "corrective_action" | "verification" | "closed";
  injury_occurred: boolean; department: string | null; investigator: string | null; days_open: number;
  actions_open: number; actions_overdue: number;
}

export interface SearchResults {
  incidents: IncidentSummary[]; hazards: HazardSummary[];
  people: { id: number; full_name: string; employee_id: string; role: Role; department: string | null }[];
  departments: { id: number; name: string; code: string }[];
}

export interface AuditEntry {
  id: number; at: string; action: string; actor_id: number | null; actor: string | null; entity_type: string | null;
  entity_id: number | null; details: Record<string, unknown> | null; ip_address: string | null;
}

export interface SupervisorDashboard {
  scope: "department" | "all"; incidents_by_status: Record<string, number>; hazards_by_status: Record<string, number>;
  unassigned_over_24h: number; actions_overdue: number; actions_due_7d: number; my_open_actions: number;
  closed_30d: number; avg_days_to_close: number | null; injuries_30d: number;
}
