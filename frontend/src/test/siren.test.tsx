import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

const alert = vi.fn();
vi.mock("@/services/api", () => ({
  ApiError: class extends Error { fields = {}; status = 500 },
  api: { emergency: { alert: (...a: unknown[]) => alert(...a), active: () => Promise.resolve([]) } },
}));
const setLocalSiren = vi.fn();
vi.mock("@/components/EmergencyAlarm", () => ({
  useEmergencyAlarm: () => ({ refresh: vi.fn(), localSiren: false, setLocalSiren }),
}));

const { SirenButton } = await import("@/components/SirenButton");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  alert.mockReset().mockResolvedValue({ id: 1, notified: 40, message: "ok" });
  setLocalSiren.mockReset();
});
afterEach(() => vi.useRealTimers());

const button = () => screen.getByRole("button", { name: /Sound the siren/ });

test("a quick tap doesn't raise the alarm", () => {
  render(<MemoryRouter><SirenButton /></MemoryRouter>);
  fireEvent.pointerDown(button());
  act(() => { vi.advanceTimersByTime(500); });
  fireEvent.pointerUp(button());
  act(() => { vi.advanceTimersByTime(3000); });
  expect(alert).not.toHaveBeenCalled();
});

test("holding raises the alarm for everyone and sounds this phone's siren", async () => {
  render(<MemoryRouter><SirenButton /></MemoryRouter>);
  fireEvent.pointerDown(button());
  await act(async () => { vi.advanceTimersByTime(2100); });
  expect(setLocalSiren).toHaveBeenCalledWith(true);
  expect(alert).toHaveBeenCalledWith("other", null, null, "en");
  expect(await screen.findByText(/Everyone on site is being alarmed/)).toBeInTheDocument();
});
