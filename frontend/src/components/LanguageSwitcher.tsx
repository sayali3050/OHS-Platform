import { Languages } from "lucide-react";
import { toast } from "sonner";
import { translate, useT } from "@/i18n";
import { LANGUAGES, type Language } from "@/types/auth";
import { cn } from "@/utils/cn";

/** Native <select>: big, familiar on every phone, and each option is written in its own script. */
export function LanguageSwitcher({ className, tone = "default" }: { className?: string; tone?: "default" | "inverted" }) {
  const { lang, setLang, t } = useT();
  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("lang.label")}</span>
      <Languages aria-hidden className={cn("pointer-events-none absolute left-2.5 h-4 w-4",
        tone === "inverted" ? "text-white/80" : "text-muted")} />
      <select value={lang} onChange={(e) => setLang(e.target.value as Language)}
        className={cn("h-10 appearance-none rounded-md border pl-8 pr-3 text-[15px] font-semibold focus:outline-none focus:ring-2 focus:ring-signal",
          tone === "inverted" ? "border-white/30 bg-transparent text-white [&>option]:text-ink" : "border-line bg-surface text-ink")}>
        {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.native}</option>)}
      </select>
    </label>
  );
}

/** Big language buttons for the home screens: one tap, each name in its own script, saved to the profile. */
export function LanguagePanel({ className }: { className?: string }) {
  const { lang, setLang, t } = useT();
  return (
    <section aria-labelledby="lang-panel" className={cn("rounded-lg border border-line bg-surface p-5", className)}>
      <h2 id="lang-panel" className="flex items-center gap-2 text-lg font-bold">
        <Languages className="h-5 w-5" aria-hidden /> {t("lang.choose")}
      </h2>
      <p className="mt-1 text-sm text-muted">{t("lang.chooseHint")}</p>
      <div role="radiogroup" aria-labelledby="lang-panel" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LANGUAGES.map((l) => (
          <button key={l.value} type="button" role="radio" aria-checked={lang === l.value} lang={l.value}
            onClick={() => { if (l.value !== lang) { setLang(l.value); toast.success(translate(l.value, "lang.changed")); } }}
            className={cn("min-h-[56px] rounded-md border px-3 text-lg font-semibold transition-colors",
              lang === l.value ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:bg-sunken")}>
            {l.native}
          </button>
        ))}
      </div>
    </section>
  );
}
