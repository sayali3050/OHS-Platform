import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, HandHelping, ShieldAlert, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useT } from "@/i18n";
import { api, ApiError } from "@/services/api";
import type { ActiveEmergency } from "@/types/people";
import { dateTime } from "@/utils/format";

const POLL_MS = 10_000;

/* ---------- siren: generated with Web Audio, so there's no sound file to load or block ---------- */

class Siren {
  private ctx: AudioContext | null = null;
  private stopFns: (() => void)[] = [];

  async start(seconds?: number) {
    if (this.stopFns.length) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx ??= new Ctx();
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    const ctx = this.ctx;
    // A two-tone wail: a square wave swept between 650 and 1250 Hz by a slow LFO.
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const out = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 950;
    lfo.frequency.value = 0.9;
    lfoGain.gain.value = 300;
    out.gain.value = 0.18;
    lfo.connect(lfoGain).connect(osc.frequency);
    osc.connect(out).connect(ctx.destination);
    osc.start();
    lfo.start();
    const vibe = window.setInterval(() => navigator.vibrate?.([600, 300, 600]), 1600);
    navigator.vibrate?.([600, 300, 600]);
    this.stopFns = [() => { osc.stop(); lfo.stop(); out.disconnect(); }, () => window.clearInterval(vibe),
      () => navigator.vibrate?.(0)];
    if (seconds) window.setTimeout(() => this.stop(), seconds * 1000);
  }

  stop() {
    this.stopFns.forEach((f) => { try { f(); } catch { /* already stopped */ } });
    this.stopFns = [];
  }

  /** Browsers only allow sound after the person has interacted with the page; unlock on the first tap. */
  unlock() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx ??= new Ctx();
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }
}

/* ---------- shared state: the alarm overlay, the banner and the Emergency page all read it ---------- */

interface AlarmState {
  events: ActiveEmergency[];
  refresh: () => Promise<void>;
  respond: (id: number, status: "safe" | "need_help") => Promise<void>;
  testSiren: () => void;
  /** This phone's own siren, so people nearby hear it too (used by the siren button). */
  localSiren: boolean;
  setLocalSiren: (on: boolean) => void;
}
const AlarmContext = createContext<AlarmState>({
  events: [], refresh: async () => {}, respond: async () => {}, testSiren: () => {}, localSiren: false, setLocalSiren: () => {},
});
export const useEmergencyAlarm = () => useContext(AlarmContext);

export function EmergencyAlarmProvider({ children }: { children: ReactNode }) {
  const { t, lang } = useT();
  const [events, setEvents] = useState<ActiveEmergency[]>([]);
  const [muted, setMuted] = useState<number | null>(null);  // event id the person silenced
  const [localSiren, setLocalSiren] = useState(false);
  const siren = useRef(new Siren());
  const notified = useRef(new Set<number>());

  const refresh = useCallback(async () => {
    try { setEvents(await api.emergency.active(lang)); } catch { /* keep the last known state */ }
  }, [lang]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const unlock = () => siren.current.unlock();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", unlock);
      siren.current.stop();
    };
  }, [refresh]);

  // Someone else's emergency that I haven't answered sounds the alarm.
  const ringing = events.find((e) => !e.raised_by_me && e.my_response === null) ?? null;

  useEffect(() => {
    const s = siren.current;
    if ((ringing && muted !== ringing.id) || localSiren) s.start(); else s.stop();
    if (ringing && !notified.current.has(ringing.id)) {
      notified.current.add(ringing.id);
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
        try {
          new Notification(t("alarm.notifyTitle", { label: ringing.label }), {
            body: `${ringing.where}. ${ringing.steps[0] ?? ""}`, tag: `emergency-${ringing.id}`, requireInteraction: true,
          });
        } catch { /* some mobile browsers only allow notifications from a service worker */ }
      }
    }
  }, [ringing, muted, localSiren, t]);

  const respond = useCallback(async (id: number, status: "safe" | "need_help") => {
    const updated = await api.emergency.respond(id, status, lang);
    setEvents((list) => list.map((e) => (e.id === id ? updated : e)));
  }, [lang]);

  const testSiren = useCallback(() => { siren.current.start(3); }, []);

  return (
    <AlarmContext.Provider value={{ events, refresh, respond, testSiren, localSiren, setLocalSiren }}>
      {children}
      {ringing && <AlarmOverlay event={ringing} muted={muted === ringing.id}
        onMute={() => setMuted(muted === ringing.id ? null : ringing.id)} />}
    </AlarmContext.Provider>
  );
}

/* ---------- the full-screen alarm ---------- */

function AlarmOverlay({ event, muted, onMute }: { event: ActiveEmergency; muted: boolean; onMute: () => void }) {
  const { t, locale } = useT();
  const { respond } = useEmergencyAlarm();
  const [busy, setBusy] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, [event.id]);

  async function answer(status: "safe" | "need_help") {
    setBusy(status);
    try {
      await respond(event.id, status);
      toast.success(status === "safe" ? t("alarm.youSafe") : t("alarm.helpSent"));
    } catch (e) {
      toast.error(e instanceof ApiError && e.status === 409 ? t("alarm.over") : t("alarm.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="alarm-title" aria-describedby="alarm-where"
      className="fixed inset-0 z-[70] overflow-y-auto bg-danger-solid text-white">
      <div className="pointer-events-none absolute inset-0 animate-pulse bg-black/15 motion-reduce:animate-none" aria-hidden />
      <div className="relative mx-auto flex min-h-full max-w-xl flex-col gap-5 px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-white">
            <ShieldAlert className="h-5 w-5" aria-hidden /> {t("alarm.title")}
          </p>
          <Button variant="ghost" size="sm" onClick={onMute} className="text-white hover:bg-white/15" aria-pressed={muted}>
            {muted ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
            {muted ? t("alarm.unmute") : t("alarm.mute")}
          </Button>
        </div>
        <div>
          <h1 id="alarm-title" className="text-[34px] font-bold leading-tight sm:text-[42px]">{event.label}</h1>
          <p id="alarm-where" className="mt-2 text-xl font-semibold">{t("alarm.where", { where: event.where })}</p>
          <p className="mt-1 text-white">
            {t("alarm.raisedBy", { name: event.raised_by ?? t("act.someone"), time: dateTime(event.created_at, locale) })}
          </p>
          {event.notes && <p className="mt-2 rounded-md bg-black/20 px-3 py-2">“{event.notes}”</p>}
        </div>
        <div className="rounded-lg bg-white p-4 text-ink">
          <h2 className="font-sans text-base font-bold">{t("alarm.whatToDo")}</h2>
          <ol className="mt-2 space-y-2">
            {event.steps.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-danger-solid font-display text-sm font-bold text-white">{i + 1}</span>
                <span className="pt-0.5 text-[17px] leading-snug">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button ref={first} size="lg" onClick={() => answer("safe")} loading={busy === "safe"} disabled={!!busy}
            className="h-16 bg-safe-solid text-lg text-white hover:bg-safe-solid/90">
            <CheckCircle2 className="h-6 w-6" aria-hidden /> {t("alarm.safe")}
          </Button>
          <Button size="lg" onClick={() => answer("need_help")} loading={busy === "need_help"} disabled={!!busy}
            className="h-16 border-2 border-white bg-transparent text-lg text-white hover:bg-white/15">
            <HandHelping className="h-6 w-6" aria-hidden /> {t("alarm.needHelp")}
          </Button>
        </div>
        <Link to="/app/emergency" className="text-center font-semibold text-white underline underline-offset-4">
          {t("alarm.open")}
        </Link>
      </div>
    </div>
  );
}

/* ---------- the banner while an emergency is still on, after you've answered ---------- */

export function EmergencyBanner() {
  const { t } = useT();
  const { events } = useEmergencyAlarm();
  const where = useLocation();
  const current = events[0];
  if (!current || where.pathname === "/app/emergency") return null;
  const status = current.raised_by_me ? t("alarm.yourAlert")
    : current.my_response === "safe" ? t("alarm.youSafe")
    : current.my_response === "need_help" ? t("alarm.youNeedHelp") : "";
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-danger-solid px-4 py-2 text-[15px] text-white sm:px-6">
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
      <span className="font-semibold">{t("alarm.banner", { label: current.label, where: current.where })}</span>
      {status && <span className="text-white">{status}</span>}
      <Link to="/app/emergency" className="ml-auto font-semibold underline underline-offset-4">{t("alarm.details")}</Link>
    </div>
  );
}

/* ---------- staff: end an emergency for everyone ---------- */

export function EndEmergencyButton({ event }: { event: ActiveEmergency }) {
  const { t } = useT();
  const { refresh } = useEmergencyAlarm();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!event.can_resolve) return null;

  async function end() {
    setBusy(true);
    try {
      await api.emergency.resolve(event.id, note.trim() || null);
      toast.success(t("alarm.ended"));
      setOpen(false);
      await refresh();
    } catch {
      toast.error(t("alarm.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>{t("alarm.end")}</Button>
      <ConfirmDialog open={open} title={t("alarm.endTitle")} confirmLabel={t("alarm.end")} busy={busy}
        onCancel={() => setOpen(false)} onConfirm={end}
        body={<div className="space-y-3"><p>{t("alarm.endBody")}</p>
          <TextAreaField label={t("alarm.endNote")} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>} />
    </>
  );
}
