import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import type { User } from "@/types/auth";

let demoData = true;
vi.mock("@/services/api", () => ({
  ApiError: class extends Error { fields = {}; status = 500 },
  api: { systemInfo: () => Promise.resolve({ demo_data: demoData }) },
}));
let current: User | null = null;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: current, loading: false, login: vi.fn() }) }));

const { PasswordField } = await import("@/components/ui/field");
const { RequireAuth } = await import("@/components/RouteGuards");
const { default: LoginPage } = await import("@/pages/auth/LoginPage");

test("the eye button shows and hides the password", () => {
  render(<PasswordField label="Password" showLabel="Show password" hideLabel="Hide password" defaultValue="Secret123" />);
  const input = screen.getByLabelText("Password");
  expect(input).toHaveAttribute("type", "password");
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(input).toHaveAttribute("type", "text");
  expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
  expect(input).toHaveAttribute("type", "password");
});

test("demo sign-in buttons appear only on a demo install", async () => {
  demoData = true;
  const { unmount } = render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Demo accounts" })).toBeInTheDocument();
  unmount();

  demoData = false;
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByRole("heading", { name: "Demo accounts" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/worker" element={<RequireAuth><p>worker home</p></RequireAuth>} />
        <Route path="/app/emergency" element={<RequireAuth><p>emergency mode</p></RequireAuth>} />
        <Route path="/change-password" element={<p>choose your own password</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

test("a temporary password sends you to change it, but never blocks emergency mode", () => {
  current = { id: 9, email: "new@example.com", full_name: "New", employee_id: "W-9", phone: null, preferred_language: "en",
    role: "worker", department: null, is_active: true, must_change_password: true };
  renderAt("/app/worker");
  expect(screen.getByText("choose your own password")).toBeInTheDocument();
  renderAt("/app/emergency");
  expect(screen.getByText("emergency mode")).toBeInTheDocument();
});
