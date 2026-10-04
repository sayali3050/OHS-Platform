import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Siren, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEmergencyAlarm } from "@/components/EmergencyAlarm";
import { useT } from "@/i18n";
import { api, ApiError } from "@/services/api";
import { cn } from "@/utils/cn";

const HOLD_MS = 2000;

/**
 * The fastest way to raise the alarm: press and hold, no forms. Holding (rather than a tap) stops it going off by
 * accident in a pocket. It alarms everyone, starts the roll call, opens a critical incident, and sounds a siren on
 * this phone so people nearby without the app hear it too. Details can be added afterwards.
 */
export function SirenButton({ className }: { className?: string }) {
  const { t, lang } = useT();
  const { refresh, localSiren, setLocalSiren } = useEmergencyAlarm();
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "holding" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const started = useRef(0);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  async function raise() {
    setState("sending");
    setError("");
    navigator.vibrate?.(200);
    setLocalSiren(true);  // sound first: the people nearby matter most and need no network
    try {
      await api.emergency.alert("other", null, null, lang);
      setState("sent");
      refresh();
    } catch (e) {
      setState("idle");
      setError(e instanceof ApiError && e.status === 429 ? e.message : t("siren.failed"));
    }
  }

  function begin() {
    if (state === "sending" || state === "sent") return;
    setError("");
    setState("holding");
    started.current = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - started.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) { raise(); return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  function release() {
    if (state !== "holding") return;
    cancelAnimationFrame(frame.current);
    setProgress(0);
    setState("idle");
  }

  if (state === "sent") {
    return (
      <div role="status" className={cn("space-y-3 rounded-lg border-2 border-danger bg-danger/5 p-4", className)}>
        <p className="flex items-center gap-2 font-bold text-danger"><Siren className="h-5 w-5" aria-hidden /> {t("siren.sent")}</p>
        <div className="flex flex-wrap gap-2">
          {localSiren && (
            <Button variant="outline" onClick={() => setLocalSiren(false)}>
              <VolumeX className="h-4 w-4" aria-hidden /> {t("siren.stopLocal")}
            </Button>
          )}
          <Button asChild variant="secondary"><Link to="/app/emergency">{t("siren.addDetails")}</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <button type="button"
        onPointerDown={(e) => { e.preventDefault(); begin(); }} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
        onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); begin(); } }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") release(); }}
        onContextMenu={(e) => e.preventDefault()}
        aria-describedby="siren-help" disabled={state === "sending"}
        className="relative flex min-h-[88px] w-full touch-none select-none items-center justify-center gap-3 overflow-hidden rounded-lg bg-danger px-5 text-white shadow-panel transition-transform active:scale-[0.99] disabled:opacity-80">
        <span aria-hidden className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${progress * 100}%` }} />
        <Siren className={cn("relative h-9 w-9 shrink-0", state === "holding" && "animate-pulse motion-reduce:animate-none")} aria-hidden />
        <span className="relative text-left">
          <span className="block font-display text-2xl font-bold uppercase tracking-wide">
            {state === "sending" ? t("siren.sending") : t("siren.button")}
          </span>
          <span className="block text-[15px] font-medium text-white/90">{state === "holding" ? t("siren.holding") : t("siren.hold")}</span>
        </span>
      </button>
      <p id="siren-help" className="mt-2 text-sm text-muted">{t("siren.desc")}</p>
      {error && <p role="alert" className="mt-2 font-semibold text-danger">{error}</p>}
      {localSiren && (
        <Button variant="outline" className="mt-2" onClick={() => setLocalSiren(false)}>
          <VolumeX className="h-4 w-4" aria-hidden /> {t("siren.stopLocal")}
        </Button>
      )}
    </div>
  );
}
