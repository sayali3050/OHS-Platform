import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import type { User } from "@/types/auth";
import type { ActiveEmergency, Profile } from "@/types/people";

const user: User = {
  id: 3, email: "worker@demo.com", full_name: "Demo Worker", employee_id: "WRK-0001", phone: null,
  preferred_language: "en", role: "worker", department: { id: 1, name: "Warehouse & Logistics", code: "WHL" }, is_active: true,
};
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user, loading: false, setUser: vi.fn() }) }));

const fire: ActiveEmergency = {
  id: 7, type: "fire", label: "Fire or smoke", steps: ["Raise the alarm.", "Leave by the nearest exit."], where: "Loading Dock",
  raised_by: "Asha Patil", raised_by_me: false, notes: null, created_at: "2026-10-04T08:00:00Z", my_response: null,
  can_resolve: false, incident_id: null, counts: null,
};
const active = vi.fn();
const respond = vi.fn();
vi.mock("@/services/api", () => ({
  ApiError: class extends Error { fields = {}; status = 422 },
  api: {
    emergency: { active: (...a: unknown[]) => active(...a), respond: (...a: unknown[]) => respond(...a) },
    attachment: () => Promise.resolve(new Blob()),
  },
}));

const { EmergencyAlarmProvider, EmergencyBanner } = await import("@/components/EmergencyAlarm");
const { VoiceRecorder } = await import("@/components/VoiceRecorder");
const { DetailsTab } = await import("@/components/profile/DetailsTab");

test("someone else's emergency takes over the screen until you answer", async () => {
  active.mockResolvedValue([fire]);
  respond.mockResolvedValue({ ...fire, my_response: "safe" });
  render(<MemoryRouter><EmergencyAlarmProvider><EmergencyBanner /><p>app</p></EmergencyAlarmProvider></MemoryRouter>);

  const alarm = await screen.findByRole("alertdialog");
  expect(alarm).toHaveTextContent("Fire or smoke");
  expect(alarm).toHaveTextContent("Where: Loading Dock");
  expect(alarm).toHaveTextContent("Leave by the nearest exit.");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "I'm safe" })); });

  expect(respond).toHaveBeenCalledWith(7, "safe", "en");
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  // The banner stays until a supervisor ends the emergency.
  expect(screen.getByRole("status")).toHaveTextContent("Emergency in progress: Fire or smoke, Loading Dock.");
});

test("your own alert doesn't sound the alarm at you", async () => {
  active.mockResolvedValue([{ ...fire, raised_by_me: true }]);
  render(<MemoryRouter><EmergencyAlarmProvider><EmergencyBanner /></EmergencyAlarmProvider></MemoryRouter>);
  expect(await screen.findByText("You raised this alarm.")).toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

test("voice recorder explains when the browser can't record", () => {
  render(<VoiceRecorder value={null} onChange={() => {}} />);  // jsdom has no MediaRecorder
  expect(screen.getByText(/can't record audio/)).toBeInTheDocument();
});

const profile: Profile = {
  id: 3, email: "worker@demo.com", full_name: "Demo Worker", employee_id: "WRK-0001", phone: "+91 00000 00003",
  preferred_language: "en", role: "worker", department: { id: 1, name: "Warehouse & Logistics", code: "WHL" }, is_active: true,
  designation: "Material Handler", date_of_birth: "1990-05-01", gender: "male", blood_group: "B+", address: "1 Demo Road",
  date_of_joining: "2020-01-15", qualification: "ITI Fitter", experience_years: 8, emergency_contact_name: "Family",
  emergency_contact_relation: "Spouse", emergency_contact_phone: "+91 00000 20000", medical_notes: "Mild asthma", shift: "morning",
  supervisor: { id: 2, full_name: "Demo Supervisor" }, primary_location: { id: 1, name: "Loading Dock" }, last_login_at: null,
  created_at: "2026-01-01T00:00:00Z", is_me: true, can_edit_work: false, can_manage_health: false,
};

test("a worker sees full details and can edit personal but not employment fields", () => {
  render(<MemoryRouter><DetailsTab profile={profile} onSaved={() => {}} /></MemoryRouter>);
  for (const text of ["B+", "ITI Fitter", "Material Handler", "Demo Supervisor", "Mild asthma", "Spouse"]) {
    expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole("button", { name: /Edit details/ }));
  expect(screen.getByLabelText("Blood group")).toBeEnabled();
  expect(screen.getByLabelText("Designation")).toBeDisabled();
  expect(screen.getByText(/Only an admin or your supervisor/)).toBeInTheDocument();
});
