import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Ambulance, BellRing, CheckCircle2, Cog, Flame, FlaskConical, HeartPulse, Phone, ShieldAlert, Siren, Trash2,
  TriangleAlert, UserRound, Zap, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Badge, FormAlert, Panel, Skeleton } from "@/components/ui/misc";
import { LocationPicker } from "@/components/reports/LocationPicker";
import { EndEmergencyButton, useEmergencyAlarm } from "@/components/EmergencyAlarm";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { SirenButton } from "@/components/SirenButton";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { api, ApiError } from "@/services/api";
import type { ActiveEmergency, RollCallPerson, SiteContact } from "@/types/people";
import type { EmergencyInfo, EmergencyType } from "@/types/reports";
import { cn } from "@/utils/cn";
import { dateTime } from "@/utils/format";

const ICONS: Record<EmergencyType, LucideIcon> = {
  fire: Flame, medical: HeartPulse, chemical_spill: FlaskConical, machinery: Cog, electrical: Zap, other: TriangleAlert,
};

/** Icons for the official services, by number (labels are translated, numbers aren't). */
const SERVICE_ICON: Record<string, LucideIcon> = { "100": ShieldAlert, "101": Flame, "102": Ambulance, "108": Ambulance, "112": Siren };

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

function CallTile({ label, phone, icon: Icon, big }: { label: string; phone: string; icon: LucideIcon; big?: boolean }) {
  return (
    <a href={tel(phone)} className={cn("flex items-center gap-3 rounded-md border px-4 hover:bg-sunken",
      big ? "min-h-[76px] border-danger/40 bg-danger/5" : "min-h-[64px] border-line bg-surface")}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-danger/10 text-danger"><Icon className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{label}</span>
        <span className={cn("block tabular-nums", big ? "font-display text-2xl font-bold text-danger" : "text-muted")}>{phone}</span>
      </span>
    </a>
  );
}

/** What's sounding now: answer the roll call; staff see who's safe and can end it. */
function ActiveEmergencies() {
  const { t, locale } = useT();
  const { events, respond } = useEmergencyAlarm();
  if (!events.length) return null;
  return (
    <div className="space-y-3">
      {events.map((e) => (
        <Panel key={e.id} className="space-y-4 border-2 border-danger p-5" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-danger">
                <Siren className="h-4 w-4" aria-hidden /> {t("em.active")}
              </p>
              <h2 className="mt-1 text-xl font-bold">{e.label}: {e.where}</h2>
              <p className="text-sm text-muted">{t("alarm.raisedBy", { name: e.raised_by ?? t("act.someone"), time: dateTime(e.created_at, locale) })}</p>
            </div>
            {e.my_response && <Badge tone={e.my_response === "safe" ? "safe" : "danger"}>
              {t(e.my_response === "safe" ? "em.roll.safe" : "em.roll.need_help")}</Badge>}
          </div>
          {!e.raised_by_me && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-safe-solid text-white hover:bg-safe-solid/90" disabled={e.my_response === "safe"}
                onClick={() => respond(e.id, "safe").catch(() => toast.error(t("alarm.failed")))}>
                <CheckCircle2 className="h-4 w-4" aria-hidden /> {t("alarm.safe")}
              </Button>
              <Button size="sm" variant="outline" disabled={e.my_response === "need_help"}
                onClick={() => respond(e.id, "need_help").then(() => toast.success(t("alarm.helpSent")))
                  .catch(() => toast.error(t("alarm.failed")))}>
                {t("alarm.needHelp")}
              </Button>
            </div>
          )}
          {e.counts && <RollCall event={e} />}
        </Panel>
      ))}
    </div>
  );
}

function RollCall({ event }: { event: ActiveEmergency }) {
  const { t } = useT();
  const [people, setPeople] = useState<RollCallPerson[] | null>(null);
  const [show, setShow] = useState(false);
  const c = event.counts!;
  useEffect(() => {
    if (show) api.emergency.rollCall(event.id).then((r) => setPeople(r.people)).catch(() => setPeople([]));
  }, [show, event.id, c.safe, c.need_help]);
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {([["em.roll.safe", c.safe, "text-safe"], ["em.roll.need_help", c.need_help, "text-danger"],
          ["em.roll.none", c.no_answer, "text-muted"]] as [MessageKey, number, string][]).map(([k, n, tone]) => (
          <div key={k} className="rounded-md bg-sunken/60 p-2">
            <p className={cn("font-display text-2xl font-bold tabular-nums", tone)}>{n}</p>
            <p className="text-sm text-muted">{t(k)}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setShow((s) => !s)} aria-expanded={show}>{t("em.rollCall")}</Button>
        {event.incident_id && (
          <Button asChild variant="ghost" size="sm"><Link to={`/app/reports/incidents/${event.incident_id}`}>{t("em.followUp")}</Link></Button>
        )}
        <div className="ml-auto"><EndEmergencyButton event={event} /></div>
      </div>
      {show && (!people ? <Skeleton className="h-24" /> : (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{p.full_name}</span>
                <span className="block truncate text-sm text-muted">{p.department ?? "—"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {p.status === "need_help" && p.phone && (
                  <a href={tel(p.phone)} className="text-sm font-semibold text-info hover:underline">{t("em.call")}</a>
                )}
                <Badge tone={p.status === "safe" ? "safe" : p.status === "need_help" ? "danger" : "neutral"}>
                  {t(p.status === "safe" ? "em.roll.safe" : p.status === "need_help" ? "em.roll.need_help" : "em.roll.none")}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

/** Admins add and remove the site's own numbers. Nothing is invented: an empty list stays empty. */
function ManageSiteNumbers({ onChange }: { onChange: () => void }) {
  const { t } = useT();
  const [items, setItems] = useState<SiteContact[] | null>(null);
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.emergency.contacts().then(setItems).catch(() => setItems([])); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const c = await api.emergency.addContact(label.trim(), phone.trim());
      setItems((l) => [...(l ?? []), c]);
      setLabel(""); setPhone("");
      toast.success(t("em.added"));
      onChange();
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { phone: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: SiteContact) {
    await api.emergency.deleteContact(c.id).catch(() => toast.error(t("alarm.failed")));
    setItems((l) => l?.filter((x) => x.id !== c.id) ?? null);
    onChange();
  }

  return (
    <Panel className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">{t("em.manage")}</h2>
        <p className="text-sm text-muted">{t("em.manageHint")}</p>
      </div>
      {items && items.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span><span className="font-semibold">{c.label}</span> <span className="tabular-nums text-muted">{c.phone}</span></span>
              <Button variant="ghost" size="icon" aria-label={t("em.removeNumber", { label: c.label })} onClick={() => remove(c)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField label={t("em.addLabel")} value={label} onChange={(e) => setLabel(e.target.value)} error={errors.label} maxLength={80} />
        <TextField label={t("em.addPhone")} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} maxLength={32} />
        <Button type="submit" variant="secondary" loading={busy} disabled={label.trim().length < 2 || phone.trim().length < 3}>{t("em.add")}</Button>
      </form>
    </Panel>
  );
}

/** Lets people check the siren works on their phone and allow background notifications. */
function DeviceAlarm() {
  const { t } = useT();
  const { testSiren } = useEmergencyAlarm();
  const supported = typeof Notification !== "undefined";
  const [perm, setPerm] = useState(supported ? Notification.permission : "denied");
  return (
    <Panel className="space-y-3 p-5">
      <h2 className="text-lg font-bold">{t("em.deviceTitle")}</h2>
      <p className="text-[15px] text-muted">{t("em.deviceBody")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={testSiren}><Siren className="h-4 w-4" aria-hidden /> {t("em.testAlarm")}</Button>
        {supported && perm === "default" && (
          <Button variant="outline" size="sm" onClick={() => Notification.requestPermission().then(setPerm)}>
            <BellRing className="h-4 w-4" aria-hidden /> {t("em.allowNotif")}
          </Button>
        )}
        {perm === "granted" && <Badge tone="safe">{t("em.notifOn")}</Badge>}
        {supported && perm === "denied" && <span className="text-sm text-muted">{t("em.notifBlocked")}</span>}
      </div>
    </Panel>
  );
}

export default function EmergencyPage() {
  const { user } = useAuth();
  const { t, lang } = useT();
  const { refresh } = useEmergencyAlarm();
  const [info, setInfo] = useState<EmergencyInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [type, setType] = useState<EmergencyType | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ id: number; message: string } | null>(null);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceSent, setVoiceSent] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoadError("");
    api.emergency.info(lang).then(setInfo).catch(() => setLoadError(t("em.loadFailed")));
  };
  useEffect(load, [lang, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const guide = info?.guides.find((g) => g.type === type);
  const contacts = info?.contacts ?? [];
  const publicNumbers = contacts.filter((c) => c.kind === "public");
  const siteNumbers = contacts.filter((c) => c.kind !== "public");

  async function alert() {
    if (!type) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.emergency.alert(type, locationId, notes.trim() || null, lang);
      setSent({ id: r.id, message: r.message });
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("em.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function sendVoice() {
    if (!sent || !voice) return;
    try {
      await api.emergency.voice(sent.id, voice);
      setVoiceSent(true);
      toast.success(t("em.voiceSent"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("alarm.failed"));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-lg bg-danger-solid p-5 text-white sm:p-6">
        <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-white">
          <ShieldAlert className="h-5 w-5" aria-hidden /> {t("em.title")}
        </p>
        <h1 className="mt-2 text-[26px] font-bold leading-tight sm:text-[30px]">
          {info?.first_step ?? t("em.firstStep")}
        </h1>
      </div>

      {loadError && <FormAlert>{loadError}</FormAlert>}
      <SirenButton />
      <ActiveEmergencies />

      <Panel className="space-y-4 p-5">
        <h2 className="text-lg font-bold">{t("em.call")}</h2>
        {!info ? <Skeleton className="h-14" /> : (
          <>
            <div>
              <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-muted">{t("em.public")}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {publicNumbers.map((c, i) => (
                  <li key={c.phone}><CallTile label={c.label} phone={c.phone} big={i === 0} icon={SERVICE_ICON[c.phone] ?? Phone} /></li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-muted">{t("em.site")}</h3>
              {siteNumbers.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {siteNumbers.map((c) => (
                    <li key={`${c.label}-${c.phone}`}>
                      <CallTile label={c.label} phone={c.phone} icon={c.kind === "supervisor" ? UserRound : Phone} />
                    </li>
                  ))}
                </ul>
              )}
              {!info.contacts_configured && (
                <p className="mt-2 rounded-md border-l-4 border-caution bg-caution/10 px-4 py-3 text-[15px]">
                  <span className="font-semibold">{t("em.noNumbers")}</span>{" "}{t("em.noNumbersBody")}
                </p>
              )}
            </div>
          </>
        )}
      </Panel>

      <Panel className="p-5">
        <h2 className="text-lg font-bold">{t("em.whats")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(info?.guides ?? []).map((g) => {
            const Icon = ICONS[g.type];
            return (
              <button key={g.type} type="button" onClick={() => { setType(g.type); setSent(null); setVoice(null); setVoiceSent(false); }}
                aria-pressed={type === g.type}
                className={cn("flex min-h-[72px] items-center gap-3 rounded-md border px-3 text-left font-semibold transition-colors",
                  type === g.type ? "border-danger bg-danger-solid text-white" : "border-line bg-surface hover:bg-sunken")}>
                <Icon className="h-6 w-6 shrink-0" aria-hidden />{g.label}
              </button>
            );
          })}
          {!info && !loadError && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[72px]" />)}
        </div>
      </Panel>

      {guide && (
        <Panel className="border-danger/40 p-5" aria-live="polite">
          <h2 className="text-lg font-bold">{t("em.whatToDo", { label: guide.label })}</h2>
          <ol className="mt-3 space-y-3">
            {guide.steps.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-bold text-bg">{i + 1}</span>
                <span className="pt-0.5 text-[17px] leading-snug">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted">{t("em.general")}</p>

          <div className="mt-6 border-t border-line pt-5">
            {sent ? (
              <div className="space-y-4">
                <p role="status" className="flex items-start gap-2 rounded-md bg-safe/10 px-4 py-3 font-semibold text-safe">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {sent.message}
                </p>
                {voiceSent ? <p className="text-sm text-muted">{t("em.voiceSent")}</p> : (
                  <div className="space-y-2">
                    <p className="font-semibold">{t("em.voiceAdd")}</p>
                    <VoiceRecorder value={voice} onChange={setVoice} />
                    {voice && <Button variant="secondary" size="sm" onClick={sendVoice}>{t("em.voiceSend")}</Button>}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="font-sans text-base font-bold">{t("em.alertTitle")}</h3>
                <p className="text-[15px] text-muted">{t("em.alertEveryone")}</p>
                {error && <FormAlert>{error}</FormAlert>}
                <LocationPicker value={locationId} onChange={setLocationId} defaultDepartmentId={user?.department?.id} />
                <TextField label={t("em.anything")} hint={t("common.optional")} maxLength={500}
                  value={notes} onChange={(e) => setNotes(e.target.value)} />
                <Button variant="danger" size="lg" className="w-full sm:w-auto" loading={busy} onClick={alert}>
                  <BellRing className="h-5 w-5" aria-hidden /> {t("em.send")}
                </Button>
              </div>
            )}
          </div>
        </Panel>
      )}

      <DeviceAlarm />
      {user?.role === "admin" && <ManageSiteNumbers onChange={load} />}
    </div>
  );
}
