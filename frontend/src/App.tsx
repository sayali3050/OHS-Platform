import { lazy, Suspense, useCallback, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RedirectIfAuthed, RequireAuth, RequireRole } from "@/components/RouteGuards";
import AppLayout from "@/layouts/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import { AdminOverview, SupervisorHome } from "@/pages/app/HomePage";
import { homePathFor } from "@/utils/cn";
import { I18nProvider } from "@/i18n";
import { api } from "@/services/api";
import type { Language } from "@/types/auth";

// Route-level code splitting keeps the worker's first load small on mobile data.
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const ChangePasswordPage = lazy(() => import("@/pages/auth/ChangePasswordPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/PasswordPages").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/pages/auth/PasswordPages").then((m) => ({ default: m.ResetPasswordPage })));
const UsersPage = lazy(() => import("@/pages/app/UsersPage"));
const ProfilePage = lazy(() => import("@/pages/app/ProfilePage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const WorkerDashboard = lazy(() => import("@/pages/app/WorkerDashboard"));
const EmergencyPage = lazy(() => import("@/pages/app/EmergencyPage"));
const ReportIncidentPage = lazy(() => import("@/pages/reports/ReportIncidentPage"));
const ReportHazardPage = lazy(() => import("@/pages/reports/ReportHazardPage"));
const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage"));
const IncidentDetailPage = lazy(() => import("@/pages/reports/ReportDetailPages").then((m) => ({ default: m.IncidentDetailPage })));
const AssistantPage = lazy(() => import("@/pages/app/AssistantPage"));
const TrainingPage = lazy(() => import("@/pages/app/TrainingPage"));
const CoursePage = lazy(() => import("@/pages/app/TrainingPage").then((m) => ({ default: m.CoursePage })));
const CertificatePage = lazy(() => import("@/pages/app/TrainingPage").then((m) => ({ default: m.CertificatePage })));
const PPEPage = lazy(() => import("@/pages/app/PPEPage"));
const ChecklistsPage = lazy(() => import("@/pages/app/ChecklistsPage"));
const AnalyticsPage = lazy(() => import("@/pages/app/AnalyticsPage"));
const KnowledgePage = lazy(() => import("@/pages/app/KnowledgePage"));
const KnowledgeDocPage = lazy(() => import("@/pages/app/KnowledgePage").then((m) => ({ default: m.KnowledgeDocPage })));
const RiskPage = lazy(() => import("@/pages/app/RiskPage"));
const WellbeingPage = lazy(() => import("@/pages/app/WellbeingPage"));
const WorkloadPage = lazy(() => import("@/pages/app/WorkloadPage"));
const ActionsPage = lazy(() => import("@/pages/app/ActionsPage"));
const BoardPage = lazy(() => import("@/pages/app/BoardPage"));
const AuditPage = lazy(() => import("@/pages/app/AuditPage"));
const PersonPage = lazy(() => import("@/pages/app/ProfilePage").then((m) => ({ default: m.PersonPage })));
const DepartmentsPage = lazy(() => import("@/pages/app/DepartmentsPage"));
const DepartmentDetailPage = lazy(() => import("@/pages/app/DepartmentsPage").then((m) => ({ default: m.DepartmentDetailPage })));
const HazardDetailPage = lazy(() => import("@/pages/reports/ReportDetailPages").then((m) => ({ default: m.HazardDetailPage })));

/** The UI language follows the signed-in user's profile; picking a language saves it there, so notifications,
 * emergency guidance and SafeAssist replies arrive in the same language. */
function LanguageBridge({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const save = useCallback((lang: Language) => {
    if (user && user.preferred_language !== lang) {
      api.auth.updateMe({ preferred_language: lang }).then(setUser).catch(() => {});
    }
  }, [user, setUser]);
  return <I18nProvider userLanguage={user?.preferred_language} onChange={save}>{children}</I18nProvider>;
}

/** "/" is the public landing page; signed-in users go straight to their home screen. */
function Home({ landing = false }: { landing?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={homePathFor(user.role)} replace />;
  return landing ? <LandingPage /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ErrorBoundary>
      <AuthProvider>
      <LanguageBridge>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home landing />} />
            <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
            <Route path="/register" element={<RedirectIfAuthed><RegisterPage /></RedirectIfAuthed>} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/change-password" element={<RequireAuth><ChangePasswordPage /></RequireAuth>} />
            <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<Home />} />
              <Route path="worker" element={<RequireRole roles={["worker"]}><WorkerDashboard /></RequireRole>} />
              <Route path="supervisor" element={<RequireRole roles={["supervisor"]}><SupervisorHome /></RequireRole>} />
              <Route path="admin" element={<RequireRole roles={["admin"]}><AdminOverview /></RequireRole>} />
              <Route path="admin/users" element={<RequireRole roles={["admin"]}><UsersPage /></RequireRole>} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="report/incident" element={<ReportIncidentPage />} />
              <Route path="report/hazard" element={<ReportHazardPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="reports/incidents/:id" element={<IncidentDetailPage />} />
              <Route path="reports/hazards/:id" element={<HazardDetailPage />} />
              <Route path="emergency" element={<EmergencyPage />} />
              <Route path="assistant" element={<AssistantPage />} />
              <Route path="people/:id" element={<RequireRole roles={["supervisor", "admin"]}><PersonPage /></RequireRole>} />
              <Route path="departments" element={<DepartmentsPage />} />
              <Route path="actions" element={<ActionsPage />} />
              <Route path="risk" element={<RiskPage />} />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="knowledge/:id" element={<KnowledgeDocPage />} />
              <Route path="analytics" element={<RequireRole roles={["supervisor", "admin"]}><AnalyticsPage /></RequireRole>} />
              <Route path="training" element={<TrainingPage />} />
              <Route path="training/:id" element={<CoursePage />} />
              <Route path="training/:id/certificate" element={<CertificatePage />} />
              <Route path="ppe" element={<PPEPage />} />
              <Route path="checklists" element={<ChecklistsPage />} />
              <Route path="wellbeing" element={<WellbeingPage />} />
              <Route path="workload" element={<RequireRole roles={["supervisor", "admin"]}><WorkloadPage /></RequireRole>} />
              <Route path="board" element={<RequireRole roles={["supervisor", "admin"]}><BoardPage /></RequireRole>} />
              <Route path="admin/audit" element={<RequireRole roles={["admin"]}><AuditPage /></RequireRole>} />
              <Route path="departments/:id" element={<DepartmentDetailPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </LanguageBridge>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
