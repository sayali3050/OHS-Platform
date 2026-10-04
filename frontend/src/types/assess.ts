import type { PersonRef, PlaceRef } from "@/types/reports";
import type { ControlLevel } from "@/types/people";

export type Band = "low" | "moderate" | "high" | "critical";
export const EXPOSURES = ["rarely", "monthly", "weekly", "daily", "continuous"] as const;
export type Exposure = (typeof EXPOSURES)[number];

export interface RiskControl { level: ControlLevel; measure: string }
export interface Risk {
  id: number; title: string; hazard: { id: number; reference: string } | null; department: PlaceRef | null;
  location: PlaceRef | null; likelihood: number; severity_score: number; risk_score: number; risk_level: Band;
  affected_workers: number; exposure_frequency: Exposure | null; existing_controls: string | null;
  recommended_controls: RiskControl[]; ai_explanation: string | null; assessed_by: PersonRef | null;
  review_due: string | null; review_overdue: boolean; created_at: string; updated_at: string; can_edit: boolean;
}
export interface RiskInput {
  title: string; location_id: number | null; likelihood: number; severity_score: number; affected_workers: number;
  exposure_frequency: Exposure | null; existing_controls: string | null; recommended_controls: RiskControl[];
  review_due: string | null;
}

/** Same bands as the server (1-4 low, 5-9 moderate, 10-16 high, 20-25 critical), for the live preview only. */
export const bandOf = (score: number): Band => (score >= 20 ? "critical" : score >= 10 ? "high" : score >= 5 ? "moderate" : "low");

export const POSTURES = ["bending", "twisting", "overhead", "kneeling", "squatting", "standing_long", "sitting_long"] as const;
export const BODY_AREAS = ["neck", "shoulders", "upper_back", "lower_back", "wrists_hands", "knees", "feet"] as const;
export interface ErgonomicsInput {
  task_description: string | null; hours_per_day: number; lifts_per_hour: number; heaviest_kg: number;
  postures: string[]; repetitive_hand: boolean; vibration_tools: boolean; pushing_pulling: boolean;
  discomfort_areas: string[]; discomfort_level: number;
}
export interface Ergonomics {
  id: number; user: { id: number; full_name: string; department: string | null }; task_description: string | null;
  answers: ErgonomicsInput; risk_factors: string[]; recommendations: string[]; risk_level: Band; created_at: string;
}

export const DRUDGERY_FACTORS = ["repetition", "load", "duration", "posture", "frequency", "vibration", "recovery"] as const;
export type DrudgeryFactor = (typeof DRUDGERY_FACTORS)[number];
export interface Drudgery {
  id: number; worker: { id: number; full_name: string }; department: string | null; task_name: string;
  factors: Record<DrudgeryFactor, number>; score: number; level: "low" | "moderate" | "high"; interventions: DrudgeryFactor[];
  assessed_by: string | null; created_at: string;
}

export const FEELINGS = ["energized", "normal", "tired", "very_tired"] as const;
export interface CheckinInput {
  feeling: (typeof FEELINGS)[number]; sleep_quality: number; workload: number; physical_fatigue: number;
  mental_workload: number; support_requested: boolean;
}
export interface Checkin extends CheckinInput { checkin_date: string; fatigued: boolean }
export interface TeamWellbeing {
  people: number; days: { day: string; checkins: number; fatigued: number; avg_physical_fatigue: number | null; avg_workload: number | null }[];
  feelings_7d: Record<string, number>; support_requests: { id: number; full_name: string; day: string }[]; repeatedly_fatigued: number;
}

/* ---- Phase 6: training, PPE, checklists ---- */
export type CourseStatus = "valid" | "expiring" | "expired" | "in_progress" | "not_started";
export interface CourseCard {
  id: number; title: string; category: string; description: string | null; duration_minutes: number; validity_days: number;
  pass_mark: number; mandatory: boolean; status: CourseStatus; completion_pct: number; best_score: number | null;
  certified_on: string | null; expires_on: string | null; quizzes: number;
}
export interface QuizQuestion { id: number; kind: "mcq" | "true_false" | "scenario"; prompt: string; options: string[] }
export interface Quiz { id: number; title: string; ai_generated: boolean; questions: QuizQuestion[] }
export interface CourseDetail extends CourseCard { content: string | null; quiz: Quiz | null; can_manage: boolean }
export interface AttemptResult {
  score: number; passed: boolean; pass_mark: number; certified_on: string | null; expires_on: string | null;
  results: { question_id: number; answer: number; correct_index: number; correct: boolean; explanation: string | null }[];
}
export interface Certificate {
  number: string; name: string; employee_id: string; course: string; score: number | null; certified_on: string;
  expires_on: string | null; valid: boolean;
}
export interface Compliance {
  courses: { id: number; title: string }[];
  rows: { user_id: number; full_name: string; department: string | null; statuses: Record<string, CourseStatus>; compliance: number | null }[];
}
export interface DraftQuestion { kind: QuizQuestion["kind"]; prompt: string; options: string[]; correct_index: number; explanation: string }

export type PPEState = "ok" | "due_soon" | "overdue" | "damaged" | "missing";
export interface PPEAssignment {
  id: number; worker: { id: number; full_name: string; department: string | null };
  item: { id: number; name: string; replacement_interval_days: number }; issued_on: string; replace_by: string;
  last_inspected_on: string | null; state: PPEState; can_manage: boolean;
}
export interface PPESummary { item: string; issued: number; ok: number; due_soon: number; overdue: number; damaged_or_missing: number }

export interface Checklist {
  id: number; title: string; frequency: "daily" | "weekly"; department_id: number | null; items: { id: number; text: string }[];
  is_active: boolean; done_this_period: boolean; last_done: string | null; can_edit: boolean;
}
export interface ChecklistResult {
  id: number; checklist_id: number; checklist: string; user: { id: number; full_name: string }; location: string | null;
  completed_at: string; failed_items: number; answers: { item_id: number; answer: "yes" | "no" | "na"; note: string | null; text: string }[];
  hazard_prompts: string[];
}

/* ---- Phase 8: knowledge base ---- */
export interface KnowledgeDoc {
  id: number; title: string; doc_type: string; summary: string | null; chunk_count: number; original_filename: string | null;
  size_bytes: number; created_at: string;
}
export interface KnowledgeDocDetail extends KnowledgeDoc { chunks: { id: number; position: number; heading: string | null; text: string }[] }
export interface KnowledgeHit { document_id: number; title: string; heading: string | null; chunk_id: number; snippet: string; score: number }
