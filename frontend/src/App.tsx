import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RedirectIfAuthed, RequireAuth, RequireRole } from "@/components/RouteGuards";
import AppLayout from "@/layouts/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import { AdminOverview, RoleHome } from "@/pages/app/HomePage";
import { homePathFor } from "@/utils/cn";

// Route-level code splitting keeps the worker's first load small on mobile data.
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/PasswordPages").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/pages/auth/PasswordPages").then((m) => ({ default: m.ResetPasswordPage })));
const UsersPage = lazy(() => import("@/pages/app/UsersPage"));
const ProfilePage = lazy(() => import("@/pages/app/ProfilePage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? homePathFor(user.role) : "/login"} replace />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ErrorBoundary>
      <AuthProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
            <Route path="/register" element={<RedirectIfAuthed><RegisterPage /></RedirectIfAuthed>} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<Home />} />
              <Route path="worker" element={<RequireRole roles={["worker"]}><RoleHome /></RequireRole>} />
              <Route path="supervisor" element={<RequireRole roles={["supervisor"]}><RoleHome /></RequireRole>} />
              <Route path="admin" element={<RequireRole roles={["admin"]}><AdminOverview /></RequireRole>} />
              <Route path="admin/users" element={<RequireRole roles={["admin"]}><UsersPage /></RequireRole>} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
