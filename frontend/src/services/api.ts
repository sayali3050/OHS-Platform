import type { Department, Page, RegisterPayload, RegisterResponse, SystemInfo, TokenResponse, User } from "@/types/auth";

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
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  }).catch(() => { throw new ApiError(0, "Can't reach the server. Check your connection and try again."); });

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, body.detail ?? `Request failed (${res.status})`, body.fields ?? {});
  }
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

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
    list: (params: Record<string, string | number | boolean | undefined>) => {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]),
      );
      return request<Page<User>>(`/users?${q}`);
    },
    update: (id: number, p: Partial<{ is_active: boolean; role: User["role"]; department_id: number }>) =>
      request<User>(`/users/${id}`, json("PATCH", p)),
  },
};
