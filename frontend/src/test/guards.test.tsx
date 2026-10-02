import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { RequireRole } from "@/components/RouteGuards";
import type { User } from "@/types/auth";

const mockUser = (role: User["role"]): User => ({
  id: 1, email: "x@demo.com", full_name: "X", employee_id: "W-1", phone: null, preferred_language: "en",
  role, department: null, is_active: true,
});
let current: User | null = null;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: current, loading: false }) }));

function renderAt(role: User["role"]) {
  current = mockUser(role);
  render(
    <MemoryRouter initialEntries={["/app/admin/users"]}>
      <Routes>
        <Route path="/app/admin/users" element={<RequireRole roles={["admin"]}><p>admin area</p></RequireRole>} />
        <Route path="/app/worker" element={<p>worker home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

test("admin can open the admin area", () => {
  renderAt("admin");
  expect(screen.getByText("admin area")).toBeInTheDocument();
});

test("worker is redirected away from the admin area", () => {
  renderAt("worker");
  expect(screen.queryByText("admin area")).not.toBeInTheDocument();
  expect(screen.getByText("worker home")).toBeInTheDocument();
});

test("Button asChild renders a single link element", async () => {
  const { Button } = await import("@/components/ui/button");
  render(<MemoryRouter><Button asChild><a href="/x">Edit profile</a></Button></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Edit profile" })).toHaveAttribute("href", "/x");
});
