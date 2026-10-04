import { useCallback, useEffect, useRef, useState } from "react";

/* Browser speech APIs. Speech-to-text works in Chrome, Edge and Safari (including Hindi, Marathi and German);
 * where it's missing the mic button simply isn't shown. Text-to-speech uses the device's installed voices. */

interface RecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Speak instead of type. `onText` receives each finished phrase. */
export function useDictation(locale: string, onText: (text: string) => void) {
  const supported = recognitionCtor() !== null;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(false);
  const rec = useRef<RecognitionLike | null>(null);
  const handler = useRef(onText);
  handler.current = onText;

  const stop = useCallback(() => { rec.current?.stop(); setListening(false); }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    rec.current?.abort();
    const r = new Ctor();
    r.lang = locale;
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((res) => res[0]?.transcript ?? "").join(" ").trim();
      if (text) handler.current(text);
    };
    r.onerror = (e) => { if (e.error !== "aborted" && e.error !== "no-speech") setError(true); setListening(false); };
    r.onend = () => setListening(false);
    rec.current = r;
    setError(false);
    setListening(true);
    try { r.start(); } catch { setListening(false); setError(true); }
  }, [locale]);

  useEffect(() => () => rec.current?.abort(), []);
  return { supported, listening, error, start, stop };
}

/** Read text aloud in the current language, for people who find reading hard or have their hands full. */
export function useReadAloud(locale: string) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    const base = locale.slice(0, 2);
    const voices = window.speechSynthesis.getVoices();
    // Marathi voices are rare; Hindi voices read Devanagari well enough to be understood.
    u.voice = voices.find((v) => v.lang === locale) ?? voices.find((v) => v.lang.startsWith(base))
      ?? (base === "mr" ? voices.find((v) => v.lang.startsWith("hi")) : undefined) ?? null;
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, [locale, supported]);

  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  return { supported, speaking, speak, stop };
}
