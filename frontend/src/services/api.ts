import type { Department, Page, RegisterPayload, RegisterResponse, SystemInfo, TokenResponse, User } from "@/types/auth";
import type { Language } from "@/types/auth";
import type {
  ActivityItem, AIConversation, AIConversationSummary, AIMessage, DepartmentWithLocations, EmergencyInfo,
  EmergencyType, Hazard, HazardInput, HazardStatus, HazardSuggestion, HazardSummary, Incident, IncidentInput,
  IncidentStatus, IncidentSuggestion, IncidentSummary, Notification, PersonRef, ReportPage, WorkerDashboard,
} from "@/types/reports";
import type {
  ActiveEmergency, AdminDashboard, DepartmentCard, DepartmentInput, DepartmentProfile, HealthCheck, HealthCheckInput,
  PersonInput, PersonRecords, PersonSummary, Profile, ProfileUpdate, RollCallPerson, SiteContact, WorkHistory,
  WorkHistoryInput, ActionInput, ActionKind, ActionPage, ActionUpdate, AuditEntry, BoardCard, CapaAction, SearchResults,
  SupervisorDashboard,
} from "@/types/people";

const TOKEN_KEY = "ohs.token";

/** Remember-me tokens live in localStorage; otherwise the session ends when the tab closes. */
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY),
  set: (token: string, remember: boolean) => {
    tokenStore.clear();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  },
  clear: () => { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); },
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      // FormData sets its own multipart boundary, so only JSON bodies get an explicit type.
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  }).catch(() => { throw new ApiError(0, "Can't reach the server. Check your connection and try again."); });

  if (res.status === 204) return undefined as T;
  if (res.status === 413) throw new ApiError(413, "upload_too_large");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, body.detail ?? `Request failed (${res.status})`, body.fields ?? {});
  }
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

type Params = Record<string, string | number | boolean | undefined | null>;
const query = (params: Params) => new URLSearchParams(
  Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)]),
);

/** Report fields travel as one JSON part next to the photo files and the optional voice note. */
function reportForm(payload: unknown, photos: File[], voice?: Blob | null): RequestInit {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  photos.forEach((p) => form.append("photos", p, p.name));
  if (voice) form.append("voice", voice, voiceName(voice));
  return { method: "POST", body: form };
}

const voiceName = (b: Blob) => `voice-note.${b.type.includes("mp4") ? "m4a" : b.type.includes("ogg") ? "ogg" : "webm"}`;

/** Evidence photos need the auth header, so they're fetched as blobs rather than linked directly. */
async function fetchAttachment(id: number): Promise<Blob> {
  const token = tokenStore.get();
  const res = await fetch(`/api/attachments/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "Couldn't load this file");
  return res.blob();
}

export const api = {
  systemInfo: () => request<SystemInfo>("/system/info"),
  auth: {
    login: (email: string, password: string, remember_me: boolean) =>
      request<TokenResponse>("/auth/login", json("POST", { email, password, remember_me })),
    register: (p: RegisterPayload) => request<RegisterResponse>("/auth/register", json("POST", p)),
    me: () => request<User>("/auth/me"),
    updateMe: (p: Partial<Pick<User, "full_name" | "phone" | "preferred_language">>) =>
      request<User>("/auth/me", json("PATCH", p)),
    logout: () => request<void>("/auth/logout", { method: "POST" }),
    departments: () => request<Department[]>("/auth/departments"),
    forgotPassword: (email: string) => request<{ message: string }>("/auth/forgot-password", json("POST", { email })),
    resetPassword: (token: string, new_password: string) =>
      request<void>("/auth/reset-password", json("POST", { token, new_password })),
  },
  users: {
    list: (params: Params) => request<Page<User>>(`/users?${query(params)}`),
    update: (id: number, p: Partial<{ is_active: boolean; role: User["role"]; department_id: number }>) =>
      request<User>(`/users/${id}`, json("PATCH", p)),
  },
  locations: () => request<DepartmentWithLocations[]>("/locations"),
  incidents: {
    create: (p: IncidentInput, photos: File[], voice?: Blob | null) =>
      request<Incident>("/incidents", reportForm(p, photos, voice)),
    list: (params: Params) => request<ReportPage<IncidentSummary>>(`/incidents?${query(params)}`),
    get: (id: number) => request<Incident>(`/incidents/${id}`),
    setStatus: (id: number, status: IncidentStatus, note: string | null) =>
      request<Incident>(`/incidents/${id}/status`, json("POST", { status, note })),
    assign: (id: number, investigator_id: number) =>
      request<Incident>(`/incidents/${id}/assign`, json("POST", { investigator_id })),
    activity: (id: number) => request<ActivityItem[]>(`/incidents/${id}/activity`),
    board: (departmentId?: number | null) => request<BoardCard[]>(`/incidents/board?${query({ department_id: departmentId })}`),
  },
  hazards: {
    create: (p: HazardInput, photos: File[], voice?: Blob | null) =>
      request<Hazard>("/hazards", reportForm(p, photos, voice)),
    list: (params: Params) => request<ReportPage<HazardSummary>>(`/hazards?${query(params)}`),
    get: (id: number) => request<Hazard>(`/hazards/${id}`),
    setStatus: (id: number, status: HazardStatus, note: string | null) =>
      request<Hazard>(`/hazards/${id}/status`, json("POST", { status, note })),
    activity: (id: number) => request<ActivityItem[]>(`/hazards/${id}/activity`),
  },
  staff: (departmentId: number | null) => request<PersonRef[]>(`/staff?${query({ department_id: departmentId })}`),
  attachment: fetchAttachment,
  notifications: {
    list: (limit = 20) => request<{ items: Notification[]; unread: number }>(`/notifications?limit=${limit}`),
    unreadCount: () => request<{ unread: number }>("/notifications/unread-count"),
    markRead: (id: number) => request<Notification>(`/notifications/${id}/read`, { method: "POST" }),
    markAllRead: () => request<{ marked: number }>("/notifications/read-all", { method: "POST" }),
  },
  emergency: {
    info: (lang: Language) => request<EmergencyInfo>(`/emergency?lang=${lang}`),
    alert: (emergency_type: EmergencyType, location_id: number | null, notes: string | null, lang: Language) =>
      request<{ id: number; notified: number; message: string }>(
        `/emergency/alert?lang=${lang}`, json("POST", { emergency_type, location_id, notes })),
    active: (lang: Language) => request<ActiveEmergency[]>(`/emergency/active?lang=${lang}`),
    respond: (id: number, status: "safe" | "need_help", lang: Language) =>
      request<ActiveEmergency>(`/emergency/${id}/respond?lang=${lang}`, json("POST", { status })),
    resolve: (id: number, note: string | null) => request<void>(`/emergency/${id}/resolve`, json("POST", { note })),
    rollCall: (id: number) => request<{ event: ActiveEmergency; people: RollCallPerson[] }>(`/emergency/${id}/roll-call`),
    voice: (id: number, voice: Blob) => {
      const form = new FormData();
      form.append("voice", voice, voiceName(voice));
      return request<{ id: number }>(`/emergency/${id}/voice`, { method: "POST", body: form });
    },
    contacts: () => request<SiteContact[]>("/emergency/contacts"),
    addContact: (label: string, phone: string) => request<SiteContact>("/emergency/contacts", json("POST", { label, phone })),
    deleteContact: (id: number) => request<void>(`/emergency/contacts/${id}`, { method: "DELETE" }),
  },
  dashboard: {
    worker: () => request<WorkerDashboard>("/dashboard/worker"),
    admin: () => request<AdminDashboard>("/dashboard/admin"),
    supervisor: () => request<SupervisorDashboard>("/dashboard/supervisor"),
  },
  actions: {
    list: (params: Params) => request<ActionPage>(`/actions?${query(params)}`),
    people: (params: Params) => request<PersonRef[]>(`/actions/people?${query(params)}`),
    create: (p: ActionInput) => request<CapaAction>("/actions", json("POST", p)),
    update: (kind: ActionKind, id: number, p: ActionUpdate) => request<CapaAction>(`/actions/${kind}/${id}`, json("PATCH", p)),
    remove: (kind: ActionKind, id: number) => request<void>(`/actions/${kind}/${id}`, { method: "DELETE" }),
  },
  search: (q: string) => request<SearchResults>(`/search?${query({ q })}`),
  audit: {
    list: (params: Params) => request<Page<AuditEntry>>(`/audit?${query(params)}`),
    actions: () => request<string[]>("/audit/actions"),
  },
  people: {
    me: () => request<Profile>("/people/me"),
    get: (id: number) => request<Profile>(`/people/${id}`),
    update: (id: number, p: ProfileUpdate) => request<Profile>(`/people/${id}`, json("PATCH", p)),
    list: (params: Params) => request<Page<PersonSummary>>(`/people?${query(params)}`),
    create: (p: PersonInput) => request<Profile>("/people", json("POST", p)),
    healthChecks: (id: number) => request<HealthCheck[]>(`/people/${id}/health-checks`),
    addHealthCheck: (id: number, p: HealthCheckInput) =>
      request<HealthCheck>(`/people/${id}/health-checks`, json("POST", p)),
    deleteHealthCheck: (id: number, checkId: number) =>
      request<void>(`/people/${id}/health-checks/${checkId}`, { method: "DELETE" }),
    workHistory: (id: number) => request<WorkHistory[]>(`/people/${id}/work-history`),
    addWorkHistory: (id: number, p: WorkHistoryInput) =>
      request<WorkHistory>(`/people/${id}/work-history`, json("POST", p)),
    deleteWorkHistory: (id: number, rowId: number) =>
      request<void>(`/people/${id}/work-history/${rowId}`, { method: "DELETE" }),
    records: (id: number) => request<PersonRecords>(`/people/${id}/records`),
  },
  departments: {
    list: () => request<DepartmentCard[]>("/departments"),
    get: (id: number) => request<DepartmentProfile>(`/departments/${id}`),
    update: (id: number, p: DepartmentInput) => request<DepartmentProfile>(`/departments/${id}`, json("PATCH", p)),
    create: (p: DepartmentInput & { name: string; code: string; locations: string[] }) =>
      request<DepartmentProfile>("/departments", json("POST", p)),
  },
  ai: {
    status: () => request<{ mode: "demo" | "live"; model: string | null }>("/ai/status"),
    assist: (message: string, conversation_id: number | null, language: Language) =>
      request<{ conversation_id: number; title: string; reply: AIMessage }>(
        "/ai/assist", json("POST", { message, conversation_id, language })),
    conversations: () => request<AIConversationSummary[]>("/ai/conversations"),
    conversation: (id: number) => request<AIConversation>(`/ai/conversations/${id}`),
    deleteConversation: (id: number) => request<void>(`/ai/conversations/${id}`, { method: "DELETE" }),
    suggestHazard: (description: string, language: Language) =>
      request<HazardSuggestion>("/ai/suggest/hazard", json("POST", { description, language })),
    suggestIncident: (description: string, language: Language) =>
      request<IncidentSuggestion>("/ai/suggest/incident", json("POST", { description, language })),
  },
};
