import { Mic, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDictation, useReadAloud } from "@/hooks/useSpeech";
import { useT } from "@/i18n";

/** Mic button that appends what was said to a text field, in the current app language. */
export function MicButton({ onText, className }: { onText: (text: string) => void; className?: string }) {
  const { t, locale } = useT();
  const d = useDictation(locale, onText);
  if (!d.supported) return null;
  return (
    <div className={className}>
      <Button type="button" variant={d.listening ? "danger" : "outline"} size="sm" aria-pressed={d.listening}
        onClick={d.listening ? d.stop : d.start}>
        {d.listening ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
        {d.listening ? t("voice.stop") : t("voice.speak")}
      </Button>
      <span role="status" aria-live="polite" className="ml-2 text-sm text-muted">
        {d.listening ? t("voice.listening") : d.error ? t("voice.failed") : ""}
      </span>
    </div>
  );
}

/** Reads a block of text aloud with the device's voice for the current language. */
export function ListenButton({ text, className }: { text: string; className?: string }) {
  const { t, locale } = useT();
  const r = useReadAloud(locale);
  if (!r.supported) return null;
  return (
    <Button type="button" variant="ghost" size="sm" className={className} aria-pressed={r.speaking}
      onClick={() => (r.speaking ? r.stop() : r.speak(text))}>
      {r.speaking ? <Square className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
      {r.speaking ? t("voice.stopListen") : t("voice.listen")}
    </Button>
  );
}

/** Appends dictated text to existing text with a separating space. */
export const appendText = (current: string, spoken: string) => (current.trim() ? `${current.trimEnd()} ${spoken}` : spoken);
