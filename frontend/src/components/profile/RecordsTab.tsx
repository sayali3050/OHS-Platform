import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { SeverityBadge, StatusBadge } from "@/components/reports/badges";
import { useT, type MessageKey } from "@/i18n";
import { catalogLabel, hazardCategoryKey } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import type { PersonRecords, Profile, WorkHistory } from "@/types/people";
import { shortDate } from "@/utils/format";

const PPE_TONE = { ok: "safe", due_soon: "caution", overdue: "danger", damaged: "danger", missing: "danger" } as const;
const TRAINING_TONE = { valid: "safe", expiring: "caution", expired: "danger", in_progress: "info", not_started: "neutral" } as const;

function ListPanel({ title, children, empty }: { title: string; children: ReactNode[]; empty: string }) {
  return (
    <Panel className="overflow-hidden">
      <h2 className="px-5 pt-4 text-lg font-bold">{title} <span className="text-base font-normal text-muted">({children.length})</span></h2>
      {children.length === 0 ? <p className="px-5 pb-5 pt-2 text-muted">{empty}</p>
        : <ul className="mt-2 divide-y divide-line border-t border-line">{children}</ul>}
    </Panel>
  );
}

/** Previous records: what they reported, PPE issued, training and emergencies. */
export function RecordsTab({ profile }: { profile: Profile }) {
  const { t, locale } = useT();
  const [r, setR] = useState<PersonRecords | null>(null);
  useEffect(() => { api.people.records(profile.id).then(setR).catch(() => setR({ incidents: [], hazards: [], ppe: [], training: [], emergencies_raised: 0 })); }, [profile.id]);
  if (!r) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {([["rec.incidents", r.incidents.length], ["rec.hazards", r.hazards.length],
          ["rec.courses", r.training.filter((c) => c.current).length], ["rec.emergencies", r.emergencies_raised]] as [MessageKey, number][]).map(([k, n]) => (
          <Panel key={k} className="p-4"><p className="text-sm text-muted">{t(k)}</p><p className="mt-1 font-display text-3xl font-bold tabular-nums">{n}</p></Panel>
        ))}
      </div>
      <ListPanel title={t("rec.incidents")} empty={t("rec.none")}>
        {r.incidents.map((i) => (
          <li key={i.id}>
            <Link to={`/app/reports/incidents/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/50">
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{i.title}</p>
                <p className="text-sm text-muted">{i.reference} · {shortDate(i.occurred_at, locale)}</p></div>
              <div className="flex shrink-0 gap-1"><SeverityBadge severity={i.severity} /><StatusBadge status={i.status} kind="incident" /></div>
            </Link>
          </li>
        ))}
      </ListPanel>
      <ListPanel title={t("rec.hazards")} empty={t("rec.none")}>
        {r.hazards.map((h) => (
          <li key={h.id}>
            <Link to={`/app/reports/hazards/${h.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/50">
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{t(hazardCategoryKey(h.category))}</p>
                <p className="text-sm text-muted">{h.reference} · {shortDate(h.created_at, locale)}</p></div>
              <div className="flex shrink-0 gap-1"><SeverityBadge severity={h.severity} /><StatusBadge status={h.status} kind="hazard" /></div>
            </Link>
          </li>
        ))}
      </ListPanel>
      <div className="grid gap-6 lg:grid-cols-2">
        <ListPanel title={t("rec.ppe")} empty={t("dash.noPpe")}>
          {r.ppe.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3 px-5 py-3">
              <div><p className="font-semibold">{catalogLabel(t, "ppeItem", p.name)}</p>
                <p className="text-sm text-muted">{t("rec.issued", { date: shortDate(p.issued_on, locale) })} · {t("dash.replaceBy", { date: shortDate(p.replace_by, locale) })}</p></div>
              <Badge tone={PPE_TONE[p.status]}>{t(`ppe.${p.status}` as MessageKey)}</Badge>
            </li>
          ))}
        </ListPanel>
        <ListPanel title={t("rec.training")} empty={t("rec.none")}>
          {r.training.map((c) => (
            <li key={c.course_id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0"><p className="font-semibold">{catalogLabel(t, "course", c.title)}</p>
                <p className="text-sm text-muted">{t(c.mandatory ? "dash.mandatory" : "dash.optional")}
                  {c.expires_on ? ` · ${t(c.status === "expired" ? "dash.expiredOn" : "dash.validUntil", { date: shortDate(c.expires_on, locale) })}` : ""}</p></div>
              <Badge tone={TRAINING_TONE[c.status]}>{t(`training.${c.status}` as MessageKey)}</Badge>
            </li>
          ))}
        </ListPanel>
      </div>
    </div>
  );
}

/** Previous employment. The person or a manager can add entries. */
export function WorkHistoryTab({ profile }: { profile: Profile }) {
  const { t, locale } = useT();
  const [items, setItems] = useState<WorkHistory[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ employer: "", role_title: "", from_date: "", to_date: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const canEdit = profile.is_me || profile.can_edit_work;
  useEffect(() => { api.people.workHistory(profile.id).then(setItems).catch(() => setItems([])); }, [profile.id]);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const row = await api.people.addWorkHistory(profile.id, {
        employer: f.employer.trim(), role_title: f.role_title.trim(), from_date: f.from_date || null,
        to_date: f.to_date || null, notes: f.notes.trim() || null,
      });
      setItems((l) => [row, ...(l ?? [])]);
      setF({ employer: "", role_title: "", from_date: "", to_date: "", notes: "" });
      setAdding(false);
      toast.success(t("wh.added"));
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: WorkHistory) {
    await api.people.deleteWorkHistory(profile.id, row.id).catch(() => toast.error(t("users.updateFailed")));
    setItems((l) => l?.filter((x) => x.id !== row.id) ?? null);
  }

  const range = (w: WorkHistory) => [w.from_date && shortDate(w.from_date, locale), w.to_date ? shortDate(w.to_date, locale) : t("wh.present")]
    .filter(Boolean).join(" – ");

  return (
    <div className="space-y-6">
      {canEdit && !adding && <Button variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden /> {t("wh.add")}</Button>}
      {adding && (
        <Panel className="p-5">
          <form onSubmit={add} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t("wh.employer")} value={f.employer} onChange={(e) => set("employer", e.target.value)} error={errors.employer} maxLength={160} />
              <TextField label={t("wh.role")} value={f.role_title} onChange={(e) => set("role_title", e.target.value)} error={errors.role_title} maxLength={120} />
              <TextField label={t("wh.from")} type="date" value={f.from_date} onChange={(e) => set("from_date", e.target.value)} />
              <TextField label={t("wh.to")} type="date" hint={t("wh.toHint")} value={f.to_date} onChange={(e) => set("to_date", e.target.value)} error={errors.to_date} />
            </div>
            <TextField label={t("wh.notes")} hint={t("common.optional")} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
            <div className="flex gap-2">
              <Button type="submit" loading={busy} disabled={f.employer.trim().length < 2 || f.role_title.trim().length < 2}>{t("wh.save")}</Button>
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>{t("common.cancel")}</Button>
            </div>
          </form>
        </Panel>
      )}
      {!items ? <Skeleton className="h-32" /> : items.length === 0 ? (
        <Panel><EmptyState icon={<Briefcase className="h-6 w-6" />} title={t("wh.none")} body={t("wh.noneBody")} /></Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((w) => (
              <li key={w.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-semibold">{w.role_title}, {w.employer}</p>
                  <p className="text-sm text-muted">{range(w)}</p>
                  {w.notes && <p className="mt-1 text-[15px]">{w.notes}</p>}
                </div>
                {canEdit && <Button variant="ghost" size="icon" aria-label={t("wh.delete")} onClick={() => remove(w)}><Trash2 className="h-4 w-4" /></Button>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
