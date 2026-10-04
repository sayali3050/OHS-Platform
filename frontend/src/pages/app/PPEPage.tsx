import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HardHat, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { catalogLabel } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import type { PPEAssignment, PPEState, PPESummary } from "@/types/assess";
import { shortDate } from "@/utils/format";

const STATE_TONE: Record<PPEState, "safe" | "caution" | "danger"> = {
  ok: "safe", due_soon: "caution", overdue: "danger", damaged: "danger", missing: "danger",
};

function Row({ a, staff, onChange }: { a: PPEAssignment; staff: boolean; onChange: (a: PPEAssignment) => void }) {
  const { t, locale } = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<PPEAssignment>, done: MessageKey) => {
    setBusy(key);
    try { onChange(await fn()); toast.success(t(done)); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : t("capa.failed")); }
    finally { setBusy(null); }
  };
  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{catalogLabel(t, "ppeItem", a.item.name)}{staff && <span className="font-normal text-muted"> · {a.worker.full_name}</span>}</p>
        <p className="text-sm text-muted">{t("rec.issued", { date: shortDate(a.issued_on, locale) })} · {t("dash.replaceBy", { date: shortDate(a.replace_by, locale) })}
          {a.last_inspected_on ? ` · ${t("ppe.inspectedOn", { date: shortDate(a.last_inspected_on, locale) })}` : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={STATE_TONE[a.state]}>{t(`ppe.${a.state}` as MessageKey)}</Badge>
        {a.can_manage ? (
          <>
            <Button size="sm" variant="outline" loading={busy === "issue"} onClick={() => run("issue", () => api.ppe.issue(a.worker.id, a.item.id), "ppe.issued")}>
              <RefreshCw className="h-4 w-4" aria-hidden /> {t("ppe.replace")}</Button>
            {a.state !== "ok" && a.state !== "due_soon" ? null : (
              <Button size="sm" variant="ghost" loading={busy === "insp"} onClick={() => run("insp", () => api.ppe.inspect(a.id, "ok"), "ppe.inspected")}>{t("ppe.inspectOk")}</Button>)}
          </>
        ) : !staff && a.state !== "damaged" && a.state !== "missing" && (
          <>
            <Button size="sm" variant="ghost" loading={busy === "d"} onClick={() => run("d", () => api.ppe.report(a.id, "damaged"), "ppe.reported")}>{t("ppe.reportDamaged")}</Button>
            <Button size="sm" variant="ghost" loading={busy === "m"} onClick={() => run("m", () => api.ppe.report(a.id, "missing"), "ppe.reported")}>{t("ppe.reportMissing")}</Button>
          </>
        )}
      </div>
    </li>
  );
}

function IssueForm({ onIssued }: { onIssued: (a: PPEAssignment) => void }) {
  const { t } = useT();
  const [workers, setWorkers] = useState<{ id: number; full_name: string; department: string | null }[]>([]);
  const [items, setItems] = useState<{ id: number; name: string }[]>([]);
  const [w, setW] = useState("");
  const [i, setI] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.ppe.workers().then(setWorkers).catch(() => {}); api.ppe.items().then(setItems).catch(() => {}); }, []);
  return (
    <Panel className="space-y-3 p-5">
      <h2 className="text-lg font-bold">{t("ppe.issueTitle")}</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SelectField label={t("drud.worker")} value={w} onChange={(e) => setW(e.target.value)}>
          <option value="">{t("wf.chooseInvestigator")}</option>
          {workers.map((x) => <option key={x.id} value={x.id}>{x.full_name} ({x.department})</option>)}
        </SelectField>
        <SelectField label={t("ppe.item")} value={i} onChange={(e) => setI(e.target.value)}>
          <option value="">{t("ppe.chooseItem")}</option>
          {items.map((x) => <option key={x.id} value={x.id}>{catalogLabel(t, "ppeItem", x.name)}</option>)}
        </SelectField>
        <Button loading={busy} disabled={!w || !i} onClick={async () => {
          setBusy(true);
          try { onIssued(await api.ppe.issue(Number(w), Number(i))); toast.success(t("ppe.issued")); }
          catch (e) { toast.error(e instanceof ApiError ? e.message : t("capa.failed")); }
          finally { setBusy(false); }
        }}>{t("ppe.issue")}</Button>
      </div>
    </Panel>
  );
}

/** /app/ppe: workers see and report their own kit; supervisors issue, replace and inspect for their team. */
export default function PPEPage() {
  const { t } = useT();
  const { user } = useAuth();
  const staff = user?.role !== "worker";
  const [rows, setRows] = useState<PPEAssignment[] | null>(null);
  const [summary, setSummary] = useState<PPESummary[] | null>(null);
  const load = () => {
    api.ppe.assignments().then(setRows).catch(() => setRows([]));
    if (staff) api.ppe.summary().then(setSummary).catch(() => {});
  };
  useEffect(load, [staff]); // eslint-disable-line react-hooks/exhaustive-deps
  const replace = (a: PPEAssignment) => { setRows((l) => { const rest = (l ?? []).filter((x) => x.id !== a.id); return [a, ...rest]; }); if (staff) api.ppe.summary().then(setSummary).catch(() => {}); };

  return (
    <div className="space-y-6">
      <div><h1 className="text-[32px] font-bold">{t("ppe.title")}</h1><p className="mt-1 text-muted">{t(staff ? "ppe.subtitleStaff" : "ppe.subtitle")}</p></div>
      {staff && summary && summary.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.map((s) => (
            <Panel key={s.item} className="p-4">
              <p className="font-semibold">{catalogLabel(t, "ppeItem", s.item)}</p>
              <p className="mt-1 text-sm text-muted">{t("ppe.summaryLine", { issued: s.issued, overdue: s.overdue, bad: s.damaged_or_missing })}</p>
            </Panel>
          ))}
        </div>
      )}
      {staff && <IssueForm onIssued={replace} />}
      <Panel className="overflow-hidden">
        {!rows ? <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          : rows.length === 0 ? <EmptyState icon={<HardHat className="h-6 w-6" />} title={t("dash.noPpe")} body="" />
          : <ul className="divide-y divide-line">{rows.map((a) => <Row key={a.id} a={a} staff={staff} onChange={replace} />)}</ul>}
      </Panel>
    </div>
  );
}
