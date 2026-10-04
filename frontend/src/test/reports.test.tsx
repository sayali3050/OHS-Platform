import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import type { User } from "@/types/auth";

const user: User = {
  id: 3, email: "worker@demo.com", full_name: "Demo Worker", employee_id: "WRK-0001", phone: null,
  preferred_language: "hi", role: "worker", department: { id: 1, name: "Warehouse & Logistics", code: "WHL" }, is_active: true,
};
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user, loading: false }) }));

const createHazard = vi.fn();
const createIncident = vi.fn();
vi.mock("@/services/api", () => ({
  ApiError: class extends Error { fields = {}; status = 422 },
  api: {
    locations: () => Promise.resolve([{ id: 1, name: "Warehouse & Logistics", code: "WHL", locations: [{ id: 7, name: "Loading Dock" }] }]),
    hazards: { create: (...a: unknown[]) => createHazard(...a) },
    incidents: { create: (...a: unknown[]) => createIncident(...a) },
  },
}));

const { checkPhoto } = await import("@/components/reports/PhotoPicker");
const { StatusSteps } = await import("@/components/reports/badges");
const { default: ReportHazardPage } = await import("@/pages/reports/ReportHazardPage");
const { default: ReportIncidentPage } = await import("@/pages/reports/ReportIncidentPage");
const { timeAgo } = await import("@/utils/format");
const { I18nProvider, loadLanguage, translate } = await import("@/i18n");
await loadLanguage("hi");
await loadLanguage("de");

const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type });

test("photo check rejects non-images and oversized files", () => {
  expect(checkPhoto(file("a.jpg", "image/jpeg"))).toBeNull();
  expect(checkPhoto(file("notes.pdf", "application/pdf"))).toBe("badType");
  expect(checkPhoto(file("huge.png", "image/png", 11 * 1024 * 1024))).toBe("tooBig");
});

test("workflow steps mark done and current stages for screen readers", () => {
  render(<StatusSteps kind="incident" status="investigating" />);
  expect(screen.getByText("Investigating").closest("li")).toHaveAttribute("aria-current", "step");
  expect(screen.getByText("Reported").parentElement).toHaveTextContent("(done)");
});

test("incident form shows field errors and does not submit when empty", async () => {
  render(<MemoryRouter><ReportIncidentPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect(await screen.findByText(/Give it a short title/)).toBeInTheDocument();
  expect(screen.getByText(/Choose how serious it was/)).toBeInTheDocument();
  expect(createIncident).not.toHaveBeenCalled();
});

test("anonymous hazard explains itself and is sent without identity", async () => {
  createHazard.mockResolvedValue({ id: 9, reference: "HAZ-2026-0099", is_anonymous: true });
  // The UI language follows the user's profile (Hindi here).
  render(<I18nProvider userLanguage="hi"><MemoryRouter><ReportHazardPage /></MemoryRouter></I18nProvider>);
  const hi = (key: Parameters<typeof translate>[1]) => translate("hi", key);

  fireEvent.click(screen.getByLabelText(new RegExp(hi("hcat.slippery_floor"))));
  fireEvent.change(screen.getByLabelText(hi("haz.describe")), { target: { value: "Oil on the dock ramp near door 2" } });
  fireEvent.click(screen.getByLabelText(new RegExp(`^${hi("severity.high")}`)));
  fireEvent.click(screen.getByLabelText(new RegExp(hi("haz.anonLabel"))));
  expect(screen.getByText(hi("haz.anonOn"))).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: hi("rf.sendAnon") }));

  await waitFor(() => expect(createHazard).toHaveBeenCalledTimes(1));
  const [payload, photos, voice] = createHazard.mock.calls[0];
  expect(payload).toMatchObject({ category: "slippery_floor", severity: "high", is_anonymous: true });
  // Nobody is asked which language they wrote in: the server reads it from the text.
  expect(payload).not.toHaveProperty("original_language");
  expect(photos).toEqual([]);
  expect(voice).toBeNull();
  expect(await screen.findByText("HAZ-2026-0099")).toBeInTheDocument();
  // Anonymous reports aren't linked to the worker, so there's no "View report" link to follow.
  expect(screen.queryByRole("link", { name: hi("sent.view") })).not.toBeInTheDocument();
});

test("timeAgo reads naturally", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  const en = (key: Parameters<typeof translate>[1], values?: Record<string, number>) => translate("en", key, values);
  const de = (key: Parameters<typeof translate>[1], values?: Record<string, number>) => translate("de", key, values);
  expect(timeAgo("2026-10-02T11:59:40Z", en, undefined, now)).toBe("just now");
  expect(timeAgo("2026-10-02T11:15:00Z", en, undefined, now)).toBe("45 min ago");
  expect(timeAgo("2026-10-02T07:00:00Z", en, undefined, now)).toBe("5 h ago");
  expect(timeAgo("2026-10-02T11:15:00Z", de, "de-DE", now)).toBe(translate("de", "time.min", { n: 45 }));
});
