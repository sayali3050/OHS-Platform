import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type Dictionary, type MessageKey } from "@/i18n/en";
import type { Language } from "@/types/auth";

export type { MessageKey };

/** English is always bundled (it's the fallback). The others load on first use, so a phone downloads one language,
 * not four. Until one arrives, English shows for a moment. */
const loaded: Partial<Record<Language, Dictionary>> = { en };
const LOADERS: Record<Exclude<Language, "en">, () => Promise<Dictionary>> = {
  hi: () => import("@/i18n/hi").then((m) => m.hi),
  mr: () => import("@/i18n/mr").then((m) => m.mr),
  de: () => import("@/i18n/de").then((m) => m.de),
};

export async function loadLanguage(lang: Language): Promise<void> {
  if (!loaded[lang]) loaded[lang] = await LOADERS[lang as Exclude<Language, "en">]();
}
/** BCP-47 tags for dates, numbers, speech recognition and text-to-speech. */
export const LOCALES: Record<Language, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN", de: "de-DE" };

const STORAGE_KEY = "lang";
type Values = Record<string, string | number>;

export function translate(lang: Language, key: MessageKey, values?: Values): string {
  let text: string = loaded[lang]?.[key] ?? en[key] ?? key;
  if (values) for (const [k, v] of Object.entries(values)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

function isLanguage(v: unknown): v is Language {
  return v === "en" || v === "hi" || v === "mr" || v === "de";
}

/** Before sign-in: the language picked on this device, else the browser's, else English. */
export function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch { /* storage unavailable */ }
  const browser = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  return isLanguage(browser) ? browser : "en";
}

interface I18nState {
  lang: Language;
  locale: string;
  t: (key: MessageKey, values?: Values) => string;
  setLang: (lang: Language) => void;
}

const I18nContext = createContext<I18nState | null>(null);

/**
 * `lang` follows the signed-in user's preferred language (set elsewhere via `syncFromUser`), so notifications,
 * SafeAssist replies and the UI all agree. Choosing a language calls `onChange`, which saves it to the profile.
 */
export function I18nProvider({ children, userLanguage, onChange }: {
  children: ReactNode; userLanguage?: Language | null; onChange?: (lang: Language) => void;
}) {
  const [lang, setLangState] = useState<Language>(() => userLanguage ?? initialLanguage());
  const [, setLoadedCount] = useState(0);  // re-render once a dictionary arrives
  useEffect(() => {
    if (!loaded[lang]) loadLanguage(lang).then(() => setLoadedCount((n) => n + 1)).catch(() => { /* stay on English */ });
  }, [lang]);

  useEffect(() => { if (userLanguage) setLangState(userLanguage); }, [userLanguage]);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage unavailable */ }
  }, [lang]);

  const setLang = useCallback((next: Language) => { setLangState(next); onChange?.(next); }, [onChange]);
  const ready = !!loaded[lang];
  // `ready` is a dependency so components re-translate when the dictionary lands.
  const t = useCallback((key: MessageKey, values?: Values) => translate(lang, key, values), [lang, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ lang, locale: LOCALES[lang], t, setLang }), [lang, t, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Outside a provider (some isolated tests) this falls back to English instead of throwing. */
export function useT(): I18nState {
  return useContext(I18nContext) ?? {
    lang: "en", locale: LOCALES.en, t: (key, values) => translate("en", key, values), setLang: () => {},
  };
}
