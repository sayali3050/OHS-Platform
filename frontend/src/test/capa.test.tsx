import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import type { User } from "@/types/auth";
import type { BoardCard, CapaAction } from "@/types/people";

const user: User = {
  id: 2, email: "supervisor@demo.com", full_name: "Demo Supervisor", employee_id: "SUP-0001", phone: null,
  preferred_language: "en", role: "supervisor", department: { id: 1, name: "Warehouse & Logistics", code: "WHL" }, is_active: true,
};
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user, loading: false }) }));

const update = vi.fn();
const board = vi.fn();
const search = vi.fn();
vi.mock("@/services/api", () => ({
  ApiError: class extends Error { fields = {}; status = 422 },
  api: {
    actions: { update: (...a: unknown[]) => update(...a), remove: vi.fn() },
    incidents: { board: (...a: unknown[]) => board(...a) },
    auth: { departments: () => Promise.resolve([]) },
    search: (...a: unknown[]) => search(...a),
  },
}));

const { ActionItem } = await import("@/components/actions/ActionItem");
const { default: BoardPage } = await import("@/pages/app/BoardPage");
const { GlobalSearch } = await import("@/components/GlobalSearch");

const fix: CapaAction = {
  id: 4, kind: "corrective", description: "Fit a guard to the conveyor nip point", control_level: "engineering",
  priority: "high", due_date: "2026-10-01", state: "overdue", completed_at: null, completion_note: null,
  responsible: { id: 3, full_name: "Demo Worker" }, report: { kind: "incident", id: 9, reference: "INC-2026-0009", title: "Hand caught", department_id: 1 },
  can_edit: false, can_progress: true, created_at: "2026-09-20T09:00:00Z",
};

test("completing an action needs a note and reports it back", async () => {
  update.mockResolvedValue({ ...fix, state: "completed", completion_note: "Guard fitted", completed_at: "2026-10-04T10:00:00Z" });
  const onChange = vi.fn();
  render(<MemoryRouter><ActionItem action={fix} onChange={onChange} showReport /></MemoryRouter>);
  expect(screen.getByText("Overdue")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /INC-2026-0009/ })).toHaveAttribute("href", "/app/reports/incidents/9");

  fireEvent.click(screen.getByRole("button", { name: /Mark as done/ }));
  const complete = screen.getByRole("button", { name: "Complete action" });
  expect(complete).toBeDisabled();  // a note is required
  fireEvent.change(screen.getByLabelText("What was done?"), { target: { value: "Guard fitted" } });
  await act(async () => { fireEvent.click(complete); });
  expect(update).toHaveBeenCalledWith("corrective", 4, { state: "completed", completion_note: "Guard fitted" });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ state: "completed" }));
});

test("the board puts each incident in its workflow column", async () => {
  const card = (id: number, status: BoardCard["status"], extra: Partial<BoardCard> = {}): BoardCard => ({
    id, reference: `INC-2026-00${id}`, title: `Incident ${id}`, severity: "medium", status, injury_occurred: false,
    department: "Warehouse & Logistics", investigator: null, days_open: 0, actions_open: 0, actions_overdue: 0, ...extra,
  });
  board.mockResolvedValue([card(11, "reported", { days_open: 3 }), card(12, "corrective_action", { actions_open: 2, actions_overdue: 1 })]);
  render(<MemoryRouter><BoardPage /></MemoryRouter>);
  const reported = await screen.findByRole("region", { name: "Reported" });
  expect(within(reported).getByText("Incident 11")).toBeInTheDocument();
  const fixing = screen.getByRole("region", { name: "Corrective action" });
  expect(within(fixing).getByText("2 actions open, 1 overdue")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Closed" })).getByText("Nothing here")).toBeInTheDocument();
});

test("Ctrl+K opens search and shows matching people", async () => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
  search.mockResolvedValue({ incidents: [], hazards: [], people: [{ id: 5, full_name: "Asha Patil", employee_id: "WRK-0005",
    role: "worker", department: "Warehouse & Logistics" }], departments: [] });
  render(<MemoryRouter><GlobalSearch /></MemoryRouter>);
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  const box = screen.getByRole("textbox", { name: "Search the app" });
  fireEvent.change(box, { target: { value: "asha" } });
  await waitFor(() => expect(search).toHaveBeenCalledWith("asha"), { timeout: 1000 });
  expect(await screen.findByText("Asha Patil")).toBeInTheDocument();
});
