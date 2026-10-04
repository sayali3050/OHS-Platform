import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/field";
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
import { incidentCategoryKey, severityKey } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import { INCIDENT_CATEGORY_VALUES, type Incident, type IncidentCategory, type Severity } from "@/types/reports";

/** "YYYY-MM-DDTHH:mm" in local time, the format <input type="datetime-local"> expects. */
export function localNow(d = new Date()) {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

type Errors = Partial<Record<string, string>>;

export default function ReportIncidentPage() {
  const { user } = useAuth();
  const { t, lang } = useT();
  const blank = () => ({
    title: "", description: "", category: "" as IncidentCategory | "", severity: null as Severity | null,
    occurred_at: localNow(), location_id: null as number | null, injury_occurred: false, injury_details: "",
    people_involved: "",
  });
  const [f, setF] = useState(blank);
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Incident | null>(null);

  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function validate(): Errors {
    const e: Errors = {};
    if (f.title.trim().length < 5) e.title = t("inc.vTitle");
    if (f.description.trim().length < 10) e.description = t("inc.vDescription");
    if (!f.category) e.category = t("inc.vCategory");
    if (!f.severity) e.severity = t("inc.vSeverity");
    if (!f.occurred_at) e.occurred_at = t("inc.vWhen");
    else if (new Date(f.occurred_at) > new Date(Date.now() + 5 * 60_000)) e.occurred_at = t("inc.vFuture");
    if (f.injury_occurred && !f.injury_details.trim()) e.injury_details = t("inc.vInjury");
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setFormError("");
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`f-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const created = await api.incidents.create({
        title: f.title.trim(), description: f.description.trim(), category: f.category as IncidentCategory,
        severity: f.severity!, occurred_at: new Date(f.occurred_at).toISOString(), location_id: f.location_id,
        injury_occurred: f.injury_occurred, injury_details: f.injury_occurred ? f.injury_details.trim() : null,
        people_involved: f.people_involved.trim() || null,
      }, photos, voice);
      setDone(created);
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
    return <ReportSubmitted reference={done.reference} detailPath={`/app/reports/incidents/${done.id}`}
      onAnother={() => { setDone(null); setF(blank()); setPhotos([]); setVoice(null); }} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/" className="inline-flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t("common.back")}
        </Link>
        <h1 className="text-[32px] font-bold">{t("inc.title")}</h1>
        <p className="mt-1 text-muted">{t("inc.subtitle")}</p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-6">
        {formError && <FormAlert>{formError}</FormAlert>}
        <Panel className="space-y-5 p-5">
          <div className="space-y-2">
            <TextAreaField id="f-description" label={t("inc.what")} maxLength={5000} placeholder={t("inc.whatPh")}
              value={f.description} onChange={(e) => set("description", e.target.value)} error={errors.description} />
            <MicButton onText={(text) => set("description", appendText(f.description, text))} />
          </div>
          <AISuggestion description={f.description}
            fetch={(d) => api.ai.suggestIncident(d, lang)}
            render={(s) => (<>
              <p><span className="text-muted">{t("sug.titleLabel")}:</span> <span className="font-semibold">{s.title}</span></p>
              <p><span className="text-muted">{t("sug.type")}:</span> <span className="font-semibold">{t(incidentCategoryKey(s.category))}</span></p>
              <p><span className="text-muted">{t("sug.severity")}:</span> <span className="font-semibold">{t(severityKey(s.severity))}</span></p>
              {s.injury_likely && <p className="font-semibold text-danger">{t("sug.injury")}</p>}
            </>)}
            onApply={(s) => {
              setF((prev) => ({ ...prev, title: prev.title.trim() ? prev.title : s.title, category: s.category,
                severity: s.severity, injury_occurred: prev.injury_occurred || s.injury_likely }));
              setErrors({});
            }} />
          <TextField id="f-title" label={t("inc.shortTitle")} placeholder={t("inc.shortTitlePh")} maxLength={200}
            value={f.title} onChange={(e) => set("title", e.target.value)} error={errors.title} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField id="f-category" label={t("inc.type")} value={f.category} error={errors.category}
              onChange={(e) => set("category", e.target.value as IncidentCategory)}>
              <option value="">{t("inc.choose")}</option>
              {INCIDENT_CATEGORY_VALUES.map((c) => <option key={c} value={c}>{t(incidentCategoryKey(c))}</option>)}
            </SelectField>
            <TextField id="f-occurred_at" label={t("inc.when")} type="datetime-local" max={localNow()}
              value={f.occurred_at} onChange={(e) => set("occurred_at", e.target.value)} error={errors.occurred_at} />
          </div>
          <div id="f-severity" tabIndex={-1}>
            <SeverityPicker value={f.severity} onChange={(s) => set("severity", s)} error={errors.severity} />
          </div>
        </Panel>

        <Panel className="space-y-5 p-5">
          <h2 className="text-lg font-bold">{t("rf.where")}</h2>
          <LocationPicker value={f.location_id} onChange={(id) => set("location_id", id)}
            defaultDepartmentId={user?.department?.id} error={errors.location_id} />
        </Panel>

        <Panel className="space-y-4 p-5">
          <h2 className="text-lg font-bold">{t("inc.people")}</h2>
          <Checkbox label={t("inc.injured")} checked={f.injury_occurred}
            onChange={(e) => set("injury_occurred", e.target.checked)} />
          {f.injury_occurred && (
            <TextAreaField id="f-injury_details" label={t("inc.injuryWhat")} rows={3} maxLength={2000}
              hint={t("inc.injuryHint")}
              value={f.injury_details} onChange={(e) => set("injury_details", e.target.value)} error={errors.injury_details} />
          )}
          <TextField label={t("inc.others")} hint={t("inc.othersHint")} maxLength={500}
            value={f.people_involved} onChange={(e) => set("people_involved", e.target.value)} error={errors.people_involved} />
        </Panel>

        <Panel className="space-y-5 p-5">
          <PhotoPicker photos={photos} onChange={(p) => { setPhotos(p); setErrors((e) => ({ ...e, photos: undefined })); }}
            error={errors.photos} onError={(m) => setErrors((e) => ({ ...e, photos: m }))} />
          <VoiceRecorder value={voice} onChange={(v) => { setVoice(v); setErrors((e) => ({ ...e, voice: undefined })); }} />
          {errors.voice && <p role="alert" className="text-sm font-medium text-danger">{errors.voice}</p>}
        </Panel>

        <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="submit" size="lg" className="w-full sm:w-auto" loading={busy}>{t("rf.send")}</Button>
        </div>
      </form>
    </div>
  );
}
