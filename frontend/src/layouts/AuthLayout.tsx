import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useT } from "@/i18n";

export function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 rounded-md">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-signal text-signal-ink">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </span>
      <span className={`font-display text-xl font-bold ${inverted ? "text-white" : "text-ink"}`}>SafeOps</span>
    </Link>
  );
}

/** Split layout: a graphite "notice board" beside the form. Collapses to a single column on phones. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-[#1c2530] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <BrandMark inverted />
        <div className="max-w-lg">
          <p className="font-display text-[44px] font-bold leading-[1.1]">{t("auth.tagline")}</p>
          <p className="mt-5 text-lg text-white/70">{t("auth.pitch")}</p>
        </div>
        <ul className="grid grid-cols-3 gap-6 text-sm text-white/70">
          <li><span className="block font-display text-2xl font-bold text-white">4</span>{t("auth.statLanguages")}</li>
          <li><span className="block font-display text-2xl font-bold text-white">6</span>{t("auth.statWorkflow")}</li>
          <li><span className="block font-display text-2xl font-bold text-white">5</span>{t("auth.statControls")}</li>
        </ul>
        {/* Hazard banding along the edge: the one piece of site signage we borrow. */}
        <div aria-hidden className="absolute inset-y-0 right-0 w-2 bg-[repeating-linear-gradient(135deg,#f0b000_0_12px,#1c2530_12px_24px)]" />
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10 lg:justify-center lg:px-16">
        <div className="mb-10 flex items-center justify-between gap-3 lg:mb-8 lg:justify-end">
          <span className="lg:hidden"><BrandMark /></span>
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-[440px]">
          <h1 className="text-[32px] font-bold">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
