import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileQuestion, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { AuthImage } from "@/components/reports/AuthImage";
import { AuthAudio } from "@/components/VoiceRecorder";
import { ActionsPanel } from "@/components/actions/ActionsPanel";
import { SeverityBadge, StatusBadge, StatusSteps } from "@/components/reports/badges";
import { useT } from "@/i18n";
import { hazardCategoryKey, incidentCategoryKey, priorityKey, statusKey } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import { LANGUAGES } from "@/types/auth";
import { dateTime } from "@/utils/format";
import type {
  ActivityItem, AttachmentRef, Hazard, HazardStatus, Incident, IncidentStatus, PersonRef,
} from "@/types/reports";

type Kind = "incident" | "hazard";

const languageName = (code: string) => LANGUAGES.find((l) => l.value === code)?.native ?? code;

function useReport<T>(load: (id: number) => Promise<T>) {
  const { id } = useParams();
  const [data, setData] = useState<T | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setData(null);
    setMissing(false);
    load(Number(id)).then(setData).catch((e) => setMissing(e instanceof ApiError ? e.status === 404 || e.status === 422 : true));
  }, [id]); // load is a stable module function
  return { data, setData, missing };
}

function Shell({ back, children }: { back: string; children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to={back} className="inline-flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("detail.all")}
      </Link>
      {children}
    </div>
  );
}

function NotFound({ back }: { back: string }) {
  const { t } = useT();
  return (
    <Shell back={back}>
      <Panel><EmptyState icon={<FileQuestion className="h-6 w-6" />} title={t("detail.notFound")}
        body={t("detail.notFoundBody")}
        action={<Button asChild variant="outline"><Link to={back}>{t("detail.backToReports")}</Link></Button>} /></Panel>
    </Shell>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The stored description, plus the reporter's own words when the AI translated them into English. */
function Description({ title, text, language, original }: { title: string; text: string; language: string; original: string | null }) {
  const { t } = useT();
  return (
    <Panel className="p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap leading-relaxed">{text}</p>
      {original ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm text-muted">{t("detail.translated", { language: languageName(language) })}</p>
          <p lang={language} className="mt-1 whitespace-pre-wrap leading-relaxed">{original}</p>
        </div>
      ) : language !== "en" && (
        <p className="mt-3 text-sm text-muted">{t("detail.writtenIn", { language: languageName(language) })}</p>
      )}
    </Panel>
  );
}

/** Evidence: voice notes first (often the fullest account), then photos. */
function Evidence({ items }: { items: AttachmentRef[] }) {
  const { t } = useT();
  const voice = items.filter((a) => a.content_type.startsWith("audio/"));
  const photos = items.filter((a) => a.content_type.startsWith("image/"));
  return (
    <>
      {voice.length > 0 && (
        <Panel className="space-y-3 p-5">
          <h2 className="text-lg font-bold">{t("detail.voice")}</h2>
          {voice.map((a) => <AuthAudio key={a.id} attachment={a} />)}
        </Panel>
      )}
      {photos.length > 0 && (
        <Panel className="p-5">
          <h2 className="mb-3 text-lg font-bold">{t("detail.photos")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((a) => <AuthImage key={a.id} attachment={a} className="aspect-square w-full rounded-md" />)}
          </div>
        </Panel>
      )}
    </>
  );
}

/** Supervisor/admin actions. The API decides what's allowed; this only offers the transitions it returned. */
function Workflow<S extends IncidentStatus | HazardStatus>({ kind, status, allowed, departmentId, investigator, onStatus, onAssign }: {
  kind: Kind; status: S; allowed: S[]; departmentId?: number | null; investigator?: PersonRef | null;
  onStatus: (s: S, note: string | null) => Promise<void>; onAssign?: (id: number) => Promise<void>;
}) {
  const { t } = useT();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [staff, setStaff] = useState<PersonRef[] | null>(null);
  const [pick, setPick] = useState(investigator ? String(investigator.id) : "");

  useEffect(() => {
    if (onAssign) api.staff(departmentId ?? null).then(setStaff).catch(() => setStaff([]));
  }, [onAssign, departmentId]);

  async function run(key: string, action: () => Promise<void>, done: string) {
    setBusy(key);
    setErrors({});
    try {
      await action();
      setNote("");
      toast.success(done);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast.error(e instanceof ApiError ? e.message : t("wf.failed"));
    } finally {
      setBusy(null);
    }
  }

  if (status === "closed") {
    return (
      <Panel className="flex items-start gap-2 p-5 text-safe">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><p className="font-semibold">{t("wf.closed")}</p>
      </Panel>
    );
  }

  return (
    <Panel className="space-y-5 p-5">
      <h2 className="text-lg font-bold">{t("wf.title")}</h2>
      {onAssign && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectField label={t("wf.investigator")} className="sm:flex-1" value={pick} error={errors.investigator_id}
            onChange={(e) => setPick(e.target.value)} disabled={!staff}>
            <option value="">{t("wf.chooseInvestigator")}</option>
            {staff?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </SelectField>
          <Button variant="outline" loading={busy === "assign"} disabled={!pick || Number(pick) === investigator?.id}
            onClick={() => run("assign", () => onAssign(Number(pick)), t("wf.assigned"))}>
            {t("wf.assign")}
          </Button>
        </div>
      )}
      {allowed.length > 0 && (
        <>
          <TextAreaField label={t("wf.note")} hint={t("wf.noteHint")} maxLength={1000} rows={3}
            value={note} onChange={(e) => setNote(e.target.value)} error={errors.note ?? errors.status} />
          <div className="flex flex-wrap gap-2">
            {allowed.map((s) => (
              <Button key={s} variant={s === "closed" ? "primary" : "secondary"} loading={busy === s} disabled={!!busy}
                onClick={() => run(s, () => onStatus(s, note.trim() || null), t("wf.updated"))}>
                {t("wf.moveTo", { status: t(statusKey(s, kind)) })}
              </Button>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

/** Who did what, from the audit log. Reloads whenever the report changes. */
function History({ kind, id, version }: { kind: Kind; id: number; version: string }) {
  const { t, locale } = useT();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  useEffect(() => {
    (kind === "incident" ? api.incidents.activity(id) : api.hazards.activity(id)).then(setItems).catch(() => setItems([]));
  }, [kind, id, version]);

  const describe = (a: ActivityItem) => {
    const actor = a.actor ?? t("act.someone");
    if (a.action === "create") return a.actor ? t("act.reportedBy", { name: a.actor }) : t("act.reportedAnon");
    if (a.action === "assign") return t("act.assigned", { actor, name: a.investigator ?? t("common.unknown") });
    if (a.action === "status" && a.to_status) {
      return t("act.status", { actor, status: t(statusKey(a.to_status as IncidentStatus | HazardStatus, kind)) });
    }
    return actor;
  };

  if (items && items.length === 0) return null;
  return (
    <Panel className="p-5">
      <h2 className="mb-3 text-lg font-bold">{t("act.title")}</h2>
      {!items ? <Skeleton className="h-16" /> : (
        <ol className="space-y-3 border-l-2 border-line pl-4">
          {items.map((a) => (
            <li key={a.id}>
              <p className="font-semibold">{describe(a)}</p>
              {a.note && <p className="mt-0.5 whitespace-pre-wrap text-[15px]">“{a.note}”</p>}
              <p className="text-sm text-muted">{dateTime(a.at, locale)}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function IncidentDetailPage() {
  const { t, locale } = useT();
  const { data: i, setData, missing } = useReport<Incident>(api.incidents.get);
  const onStatus = useCallback(async (s: IncidentStatus, note: string | null) => {
    if (i) setData(await api.incidents.setStatus(i.id, s, note));
  }, [i, setData]);
  const onAssign = useCallback(async (person: number) => {
    if (i) setData(await api.incidents.assign(i.id, person));
  }, [i, setData]);

  if (missing) return <NotFound back="/app/reports" />;
  if (!i) return <Shell back="/app/reports"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64" /></Shell>;
  return (
    <Shell back="/app/reports">
      <header className="space-y-3">
        <p className="text-sm font-semibold tabular-nums text-muted">{i.reference} · {t("detail.incident")}</p>
        <h1 className="text-[30px] font-bold">{i.title}</h1>
        <div className="flex flex-wrap gap-2">
          <SeverityBadge severity={i.severity} /><StatusBadge status={i.status} kind="incident" />
          {i.injury_occurred && <Badge tone="danger">{t("detail.injury")}</Badge>}
        </div>
      </header>
      <Panel className="p-5">
        <h2 className="mb-3 text-lg font-bold">{t("detail.progress")}</h2>
        <StatusSteps kind="incident" status={i.status} />
      </Panel>
      {i.can_manage && (
        <Workflow kind="incident" status={i.status} allowed={i.allowed_transitions} departmentId={i.department?.id}
          investigator={i.investigator} onStatus={onStatus} onAssign={onAssign} />
      )}
      <ActionsPanel report={{ kind: "incident", id: i.id }} canManage={i.can_manage} closed={i.status === "closed"} />
      <Description title={t("detail.whatHappened")} text={i.description} language={i.original_language} original={i.original_description} />
      <Panel className="overflow-hidden">
        <Facts rows={[
          [t("detail.type"), t(incidentCategoryKey(i.category))],
          [t("detail.when"), dateTime(i.occurred_at, locale)],
          [t("detail.where"), [i.location?.name, i.department?.name].filter(Boolean).join(", ") || t("common.notGiven")],
          [t("detail.injuryFact"), i.injury_occurred ? i.injury_details : t("detail.noInjury")],
          [t("detail.people"), i.people_involved ?? t("common.notGiven")],
          [t("detail.reportedBy"), i.reporter?.full_name ?? t("common.unknown")],
          [t("detail.investigator"), i.investigator?.full_name ?? t("detail.notAssigned")],
          [t("detail.reportedOn"), dateTime(i.created_at, locale)],
        ]} />
      </Panel>
      <Evidence items={i.attachments} />
      <History kind="incident" id={i.id} version={`${i.status}-${i.investigator?.id ?? ""}`} />
    </Shell>
  );
}

export function HazardDetailPage() {
  const { t, locale } = useT();
  const { data: h, setData, missing } = useReport<Hazard>(api.hazards.get);
  const onStatus = useCallback(async (s: HazardStatus, note: string | null) => {
    if (h) setData(await api.hazards.setStatus(h.id, s, note));
  }, [h, setData]);
  const back = "/app/reports?tab=hazards";

  if (missing) return <NotFound back={back} />;
  if (!h) return <Shell back={back}><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64" /></Shell>;
  return (
    <Shell back={back}>
      <header className="space-y-3">
        <p className="text-sm font-semibold tabular-nums text-muted">{h.reference} · {t("detail.hazard")}</p>
        <h1 className="text-[30px] font-bold">{t(hazardCategoryKey(h.category))}</h1>
        <div className="flex flex-wrap gap-2">
          <SeverityBadge severity={h.severity} /><StatusBadge status={h.status} kind="hazard" />
          {h.is_anonymous && <Badge><UserX className="h-3.5 w-3.5" aria-hidden /> {t("list.anonymous")}</Badge>}
        </div>
      </header>
      <Panel className="p-5">
        <h2 className="mb-3 text-lg font-bold">{t("detail.progress")}</h2>
        <StatusSteps kind="hazard" status={h.status} />
      </Panel>
      {h.can_manage && <Workflow kind="hazard" status={h.status} allowed={h.allowed_transitions} onStatus={onStatus} />}
      <ActionsPanel report={{ kind: "hazard", id: h.id }} canManage={h.can_manage} closed={h.status === "closed"} />
      <Description title={t("detail.description")} text={h.description} language={h.original_language} original={h.original_description} />
      <Panel className="overflow-hidden">
        <Facts rows={[
          [t("detail.where"), [h.location?.name, h.department?.name].filter(Boolean).join(", ") || t("common.notGiven")],
          [t("detail.priority"), t(priorityKey(h.priority))],
          [t("detail.reportedBy"), h.is_anonymous ? t("detail.anonymous") : h.reporter?.full_name ?? t("common.unknown")],
          [t("detail.reportedOn"), dateTime(h.created_at, locale)],
        ]} />
      </Panel>
      <Evidence items={h.attachments} />
      <History kind="hazard" id={h.id} version={h.status} />
    </Shell>
  );
}
