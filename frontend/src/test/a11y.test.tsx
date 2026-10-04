import axe from "axe-core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import type { User } from "@/types/auth";

/** Automated accessibility checks (axe-core) on the main worker screens: labels, roles, names, landmarks, ARIA.
 * Colour contrast can't be measured in jsdom, so it's checked by eye and in the browser audit instead. */
const user: User = {
  id: 3, email: "worker@demo.com", full_name: "Demo Worker", employee_id: "WRK-0001", phone: null,
  preferred_language: "en", role: "worker", department: { id: 1, name: "Warehouse & Logistics", code: "WHL" }, is_active: true,
};
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user, loading: false, setUser: vi.fn() }) }));
const ok = <T,>(v: T) => () => Promise.resolve(v);
vi.mock("@/services/api", () => ({
  ApiError: class extends Error { fields = {}; status = 422 },
  tokenStore: { get: () => null },
  api: {
    locations: ok([{ id: 1, name: "Warehouse & Logistics", code: "WHL", locations: [{ id: 7, name: "Loading Dock" }] }]),
    wellbeing: { mine: ok([]), today: vi.fn() },
    ergonomics: { list: ok([]), submit: vi.fn() },
    drudgery: { list: ok([]) },
    checklists: { list: ok([{ id: 1, title: "Pre-shift safety walk", frequency: "daily", department_id: null, is_active: true,
      done_this_period: false, last_done: null, can_edit: false, items: [{ id: 1, text: "Exits are clear" }, { id: 2, text: "No spills" }] }]),
      results: ok([]) },
    risks: { list: ok([]), matrix: ok([[0, 0, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 0, 0, 0]]) },
    hazards: { create: vi.fn() },
    ai: { suggestHazard: vi.fn() },
  },
}));

const { default: ReportHazardPage } = await import("@/pages/reports/ReportHazardPage");
const { default: WellbeingPage } = await import("@/pages/app/WellbeingPage");
const { default: ChecklistsPage } = await import("@/pages/app/ChecklistsPage");
const { default: RiskPage } = await import("@/pages/app/RiskPage");

async function violations(node: HTMLElement) {
  const r = await axe.run(node, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("hazard report form has no accessibility violations", async () => {
  const { container } = render(<MemoryRouter><ReportHazardPage /></MemoryRouter>);
  await screen.findByText("Loading Dock", {}, { timeout: 2000 }).catch(() => {});
  expect(await violations(container)).toEqual([]);
});

test("wellbeing check-in has no accessibility violations", async () => {
  const { container } = render(<MemoryRouter><WellbeingPage /></MemoryRouter>);
  await screen.findByText("How are you today?");
  expect(await violations(container)).toEqual([]);
});

test("checklists page has no accessibility violations", async () => {
  const { container } = render(<MemoryRouter><ChecklistsPage /></MemoryRouter>);
  await screen.findByText("Pre-shift safety walk");
  expect(await violations(container)).toEqual([]);
});

test("risk matrix has no accessibility violations", async () => {
  const { container } = render(<MemoryRouter><RiskPage /></MemoryRouter>);
  await screen.findByRole("table");
  expect(await violations(container)).toEqual([]);
});
