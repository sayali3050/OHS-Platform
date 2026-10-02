export type Role = "worker" | "supervisor" | "admin";
export type Language = "en" | "hi" | "mr" | "de";

export interface Department { id: number; name: string; code: string }

export interface User {
  id: number;
  email: string;
  full_name: string;
  employee_id: string;
  phone: string | null;
  preferred_language: Language;
  role: Role;
  department: Department | null;
  is_active: boolean;
}

export interface TokenResponse { access_token: string; token_type: "bearer"; expires_in: number; user: User }
export interface RegisterPayload {
  full_name: string; email: string; password: string; employee_id: string;
  department_id: number; role: Exclude<Role, "admin">; phone?: string; preferred_language: Language;
}
export interface RegisterResponse { user: User; requires_approval: boolean; message: string }
export interface Page<T> { items: T[]; total: number; page: number; page_size: number }
export interface SystemInfo { app_name: string; environment: string; ai_demo_mode: boolean; demo_data: boolean }

export const LANGUAGES: { value: Language; label: string; native: string }[] = [
  { value: "en", label: "English", native: "English" },
  { value: "hi", label: "Hindi", native: "हिन्दी" },
  { value: "mr", label: "Marathi", native: "मराठी" },
  { value: "de", label: "German", native: "Deutsch" },
];
