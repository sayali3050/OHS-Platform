import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Cable, CircleHelp, Cog, DoorClosed, Droplets, EyeOff, Flame, FlaskConical, HardHat, Lightbulb,
  PersonStanding, Volume2, Weight, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { FormAlert, Panel } from "@/components/ui/misc";
import { AISuggestion } from "@/components/reports/AISuggestion";
import { LocationPicker } from "@/components/reports/LocationPicker";
import { PhotoPicker } from "@/components/reports/PhotoPicker";
import { ReportSubmitted } from "@/components/reports/ReportSubmitted";
import { SeverityPicker } from "@/components/reports/SeverityPicker";
import { MicButton, appendText } from "@/components/voice";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { hazardCategoryKey, severityKey } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import { HAZARD_CATEGORY_VALUES, type Hazard, type HazardCategory, type Severity } from "@/types/reports";
import { cn } from "@/utils/cn";

const ICONS: Record<HazardCategory, LucideIcon> = {
  unsafe_machine: Cog, slippery_floor: Droplets, exposed_wire: Cable, missing_ppe: HardHat, excessive_noise: Volume2,
  poor_lighting: Lightbulb, chemical_leak: FlaskConical, unsafe_lifting: Weight, fire_hazard: Flame,
  blocked_exit: DoorClosed, ergonomic: PersonStanding, other: CircleHelp,
};

type Errors = Partial<Record<string, string>>;

export default function ReportHazardPage() {
  const { user } = useAuth();
  const { t, lang } = useT();
  const blank = () => ({
    category: null as HazardCategory | null, description: "", severity: null as Severity | null,
    location_id: null as number | null, is_anonymous: false,
  });
  const [f, setF] = useState(blank);
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Hazard | null>(null);

  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setFormError("");
    const e: Errors = {};
    if (!f.category) e.category = t("haz.vCategory");
    if (f.description.trim().length < 10) e.description = t("haz.vDescription");
    if (!f.severity) e.severity = t("haz.vSeverity");
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`f-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      setDone(await api.hazards.create({
        category: f.category!, description: f.description.trim(), severity: f.severity!, location_id: f.location_id,
        is_anonymous: f.is_anonymous,
      }, photos, voice));
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      setFormError(err instanceof ApiError
        ? (err.status === 413 ? t("photos.uploadTooBig") : err.message) : t("rf.sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <ReportSubmitted reference={done.reference} anonymous={done.is_anonymous}
      detailPath={done.is_anonymous ? null : `/app/reports/hazards/${done.id}`}
      onAnother={() => { setDone(null); setF(blank()); setPhotos([]); setVoice(null); }} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/" className="inline-flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t("common.back")}
        </Link>
        <h1 className="text-[32px] font-bold">{t("haz.title")}</h1>
        <p className="mt-1 text-muted">{t("haz.subtitle")}</p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-6">
        {formError && <FormAlert>{formError}</FormAlert>}
        <Panel className="space-y-5 p-5">
          <div className="space-y-2">
            <TextAreaField id="f-description" label={t("haz.describe")} maxLength={5000} placeholder={t("haz.describePh")}
              value={f.description} onChange={(e) => set("description", e.target.value)} error={errors.description} />
            <MicButton onText={(text) => set("description", appendText(f.description, text))} />
          </div>
          <AISuggestion description={f.description}
            fetch={(d) => api.ai.suggestHazard(d, lang)}
            render={(s) => (<>
              <p><span className="text-muted">{t("sug.type")}:</span> <span className="font-semibold">{t(hazardCategoryKey(s.category))}</span></p>
              <p><span className="text-muted">{t("sug.severity")}:</span> <span className="font-semibold">{t(severityKey(s.severity))}</span></p>
            </>)}
            onApply={(s) => { setF((prev) => ({ ...prev, category: s.category, severity: s.severity })); setErrors({}); }} />
          <fieldset id="f-category" tabIndex={-1} aria-describedby={errors.category ? "category-err" : undefined}>
            <legend className="mb-2 text-sm font-semibold">{t("haz.kind")}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {HAZARD_CATEGORY_VALUES.map((c) => {
                const Icon = ICONS[c];
                const on = f.category === c;
                return (
                  <label key={c} className={cn(
                    "flex min-h-[84px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border p-2 text-center text-sm font-semibold leading-tight transition-colors",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal",
                    on ? "border-ink bg-ink text-bg" : errors.category ? "border-danger bg-surface" : "border-line bg-surface hover:bg-sunken",
                  )}>
                    <input type="radio" name="category" value={c} checked={on} className="sr-only" onChange={() => set("category", c)} />
                    <Icon className="h-6 w-6" aria-hidden />
                    {t(hazardCategoryKey(c))}
                  </label>
                );
              })}
            </div>
            {errors.category && <p id="category-err" role="alert" className="mt-1.5 text-sm font-medium text-danger">{errors.category}</p>}
          </fieldset>
          <div id="f-severity" tabIndex={-1}>
            <SeverityPicker value={f.severity} onChange={(s) => set("severity", s)} error={errors.severity} />
          </div>
        </Panel>

        <Panel className="space-y-5 p-5">
          <h2 className="text-lg font-bold">{t("rf.where")}</h2>
          <LocationPicker value={f.location_id} onChange={(id) => set("location_id", id)}
            defaultDepartmentId={user?.department?.id} error={errors.location_id} />
        </Panel>

        <Panel className="space-y-5 p-5">
          <PhotoPicker photos={photos} onChange={(p) => { setPhotos(p); setErrors((e) => ({ ...e, photos: undefined })); }}
            error={errors.photos} onError={(m) => setErrors((e) => ({ ...e, photos: m }))} />
          <VoiceRecorder value={voice} onChange={(v) => { setVoice(v); setErrors((e) => ({ ...e, voice: undefined })); }}
            warning={f.is_anonymous ? t("rec.anonWarning") : undefined} />
          {errors.voice && <p role="alert" className="text-sm font-medium text-danger">{errors.voice}</p>}
        </Panel>

        <Panel className={cn("p-5 transition-colors", f.is_anonymous && "border-info bg-info/5")}>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={f.is_anonymous} onChange={(e) => set("is_anonymous", e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 rounded accent-[hsl(var(--info))]" aria-describedby="anon-help" />
            <span>
              <span className="flex items-center gap-2 font-semibold"><EyeOff className="h-4 w-4" aria-hidden /> {t("haz.anonLabel")}</span>
              <span id="anon-help" className="mt-1 block text-[15px] text-muted">{f.is_anonymous ? t("haz.anonOn") : t("haz.anonOff")}</span>
            </span>
          </label>
        </Panel>

        <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="submit" size="lg" className="w-full sm:w-auto" loading={busy}>
            {f.is_anonymous ? t("rf.sendAnon") : t("rf.send")}
          </Button>
        </div>
      </form>
    </div>
  );
}
