import { useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { api } from "@/services/api";
import type { AttachmentRef } from "@/types/reports";
import { cn } from "@/utils/cn";

const MAX_SECONDS = 300;
/** Opus at 32 kbit/s keeps five minutes of speech near 1.2 MB, well inside the server's limit. */
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function recordingSupported() {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia;
}

/** Record a voice note on the phone, listen back, then keep, redo or remove it. Nothing uploads until the form is sent. */
export function VoiceRecorder({ value, onChange, warning, className }: {
  value: Blob | null; onChange: (b: Blob | null) => void; warning?: string; className?: string;
}) {
  const { t } = useT();
  const [state, setState] = useState<"idle" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number>();

  useEffect(() => {
    if (!value) { setUrl(null); return; }
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  useEffect(() => () => { window.clearInterval(timer.current); rec.current?.stream.getTracks().forEach((tr) => tr.stop()); }, []);

  async function start() {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError(t("rec.denied"));
      return;
    }
    const mimeType = TYPES.find((m) => MediaRecorder.isTypeSupported?.(m));
    const r = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    const chunks: BlobPart[] = [];
    const began = Date.now();
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      window.clearInterval(timer.current);
      stream.getTracks().forEach((tr) => tr.stop());
      setDuration(Math.round((Date.now() - began) / 1000));
      setState("idle");
      onChange(new Blob(chunks, { type: (r.mimeType || mimeType || "audio/webm").split(";")[0] }));
    };
    rec.current = r;
    r.start(1000);
    setSeconds(0);
    setState("recording");
    timer.current = window.setInterval(() => {
      const s = (Date.now() - began) / 1000;
      setSeconds(s);
      if (s >= MAX_SECONDS) r.stop();
    }, 250);
  }

  const stop = () => rec.current?.state === "recording" && rec.current.stop();

  if (!recordingSupported()) {
    return <p className={cn("text-sm text-muted", className)}>{t("rec.unsupported")}</p>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm font-semibold">{t("rec.label")} <span className="font-normal text-muted">{t("rec.optional")}</span></p>
      {state === "recording" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-danger/40 bg-danger/5 p-3">
          <span className="relative flex h-3 w-3" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-danger" />
          </span>
          <span role="status" className="font-semibold tabular-nums">{t("rec.recording", { time: clock(seconds) })}</span>
          <Button type="button" variant="danger" size="sm" onClick={stop} className="ml-auto">
            <Square className="h-4 w-4" aria-hidden /> {t("rec.stop")}
          </Button>
        </div>
      ) : value && url ? (
        <div className="space-y-2 rounded-md border border-line bg-sunken/40 p-3">
          <p className="text-sm font-semibold">{t("rec.ready", { time: clock(duration) })}</p>
          <audio controls src={url} className="w-full" aria-label={t("rec.player")} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={start}>
              <RotateCcw className="h-4 w-4" aria-hidden /> {t("rec.again")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <Trash2 className="h-4 w-4" aria-hidden /> {t("rec.remove")}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={start}>
          <Mic className="h-4 w-4" aria-hidden /> {t("rec.start")}
        </Button>
      )}
      <p className="text-sm text-muted">{warning ?? t("rec.hint")}</p>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

/** Plays a stored voice note. The file needs the auth header, so it's fetched as a blob first. */
export function AuthAudio({ attachment }: { attachment: AttachmentRef }) {
  const { t } = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    api.attachment(attachment.id).then((b) => { u = URL.createObjectURL(b); setUrl(u); }).catch(() => setFailed(true));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [attachment.id]);
  if (failed) return <p className="text-sm text-muted">{t("rec.failed")}</p>;
  return url ? <audio controls src={url} className="w-full" aria-label={t("rec.player")} />
    : <div className="h-12 animate-pulse rounded-md bg-sunken" />;
}
