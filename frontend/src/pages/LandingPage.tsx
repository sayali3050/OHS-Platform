import { Link } from "react-router-dom";
import {
  BellRing, Camera, ClipboardCheck, EyeOff, Gauge, Languages, ShieldAlert, Smartphone, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/layouts/AuthLayout";

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Smartphone, title: "Report in under a minute", body: "Big buttons, few fields, and photos straight from the phone camera. Built for gloves and site data connections." },
  { icon: EyeOff, title: "Truly anonymous hazards", body: "Anonymous means no name is stored at all: not on the report, the photos or the activity log." },
  { icon: BellRing, title: "The right people hear first", body: "Supervisors are notified the moment a report arrives. Serious reports go straight to the safety administrators too." },
  { icon: ShieldAlert, title: "Emergency mode", body: "Clear first steps for fire, injury, chemical and machine emergencies, one-tap calling, and an instant alert to the team." },
  { icon: Gauge, title: "A safety score you can check", body: "Each worker's score is built from PPE and training records, with every component shown, so it's never a black box." },
  { icon: Languages, title: "In your own language", body: "Report in English, Hindi, Marathi or German. Your exact words are kept alongside any translation." },
];

const STEPS = [
  { icon: Camera, title: "Spot it, snap it", body: "A worker reports a hazard or incident from their phone, with photos and location." },
  { icon: BellRing, title: "Supervisor notified", body: "The department supervisor gets an in-app alert straight away; serious reports reach admins too." },
  { icon: ClipboardCheck, title: "Followed to closure", body: "Every report moves through a defined workflow until the fix is verified." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="relative overflow-hidden bg-[#1c2530] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <BrandMark inverted />
          <div className="flex gap-2">
            <Button asChild variant="ghost" className="text-white hover:bg-white/10"><Link to="/login">Sign in</Link></Button>
            <Button asChild className="hidden sm:inline-flex"><Link to="/register">Create account</Link></Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16">
          <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-signal">Occupational health & safety</p>
          <h1 className="mt-4 max-w-3xl text-[40px] font-bold leading-[1.05] sm:text-[56px]">
            Safer workplaces. Smarter decisions. Healthier workers.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/75">
            SafeOps lets every worker report hazards and incidents from their phone, gets them to the right supervisor
            straight away, and reduces the physical drudgery that wears people down.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg"><Link to="/login">Sign in to report</Link></Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
              <Link to="/register">Create a worker account</Link>
            </Button>
          </div>
        </div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-2 bg-[repeating-linear-gradient(135deg,#f0b000_0_12px,#1c2530_12px_24px)]" />
      </header>

      <main>
        <section aria-labelledby="features-h" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="features-h" className="text-[30px] font-bold">Built for the shop floor</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-lg border border-line bg-surface p-5">
                <span className="grid h-11 w-11 place-items-center rounded-md bg-signal/20 text-ink"><f.icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-4 text-xl font-bold">{f.title}</h3>
                <p className="mt-1.5 text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-h" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="how-h" className="text-[30px] font-bold">How a report travels</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink font-display text-lg font-bold text-bg">{i + 1}</span>
                  <div>
                    <h3 className="flex items-center gap-2 text-xl font-bold"><s.icon className="h-5 w-5 text-muted" aria-hidden />{s.title}</h3>
                    <p className="mt-1 text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-[30px] font-bold">Seen something unsafe?</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted">Sign in and report it. It takes less than a minute, and you can do it anonymously.</p>
          <Button asChild size="lg" className="mt-6"><Link to="/login">Sign in</Link></Button>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
          <p>SafeOps: final-year project on occupational health and safety.</p>
          <p>This installation contains synthetic demo data.</p>
        </div>
      </footer>
    </div>
  );
}
