import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { useT, type MessageKey } from "@/i18n";
import { api } from "@/services/api";
import type { Page } from "@/types/auth";
import type { AuditEntry } from "@/types/people";
import { dateTime } from "@/utils/format";

const PAGE_SIZE = 50;
const control = "h-11 rounded-md border border-line bg-surface px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-signal";

/** Links an entry to the thing it's about, where there's a page for it. */
function entityLink(e: AuditEntry): string | null {
  if (!e.entity_id) return null;
  if (e.entity_type === "incident") return `/app/reports/incidents/${e.entity_id}`;
  if (e.entity_type === "hazard") return `/app/reports/hazards/${e.entity_id}`;
  if (e.entity_type === "user") return `/app/people/${e.entity_id}`;
  if (e.entity_type === "department") return `/app/departments/${e.entity_id}`;
  return null;
}

const summary = (d: Record<string, unknown> | null) =>
  d ? Object.entries(d).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ") : "";

/** /app/admin/audit: read-only, newest first, filterable. */
export default function AuditPage() {
  const { t, locale } = useT();
  const [actions, setActions] = useState<string[]>([]);
  const [f, setF] = useState({ action: "", q: "", date_from: "", date_to: "" });
  const [applied, setApplied] = useState(f);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditEntry> | null>(null);

  useEffect(() => { api.audit.actions().then(setActions).catch(() => {}); }, []);
  useEffect(() => {
    setData(null);
    api.audit.list({ ...applied, page, page_size: PAGE_SIZE }).then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, page_size: PAGE_SIZE }));
  }, [applied, page]);

  const submit = (e: FormEvent) => { e.preventDefault(); setPage(1); setApplied(f); };
  const prefixes = [...new Set(actions.filter((a) => a.includes(".")).map((a) => `${a.split(".")[0]}.`))];
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold">{t("audit.title")}</h1>
        <p className="mt-1 text-muted">{t("audit.subtitle")}</p>
      </div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto]">
        <label className="sr-only" htmlFor="a-q">{t("audit.who")}</label>
        <input id="a-q" className={control} placeholder={t("audit.who")} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <label className="sr-only" htmlFor="a-action">{t("audit.action")}</label>
        <select id="a-action" className={control} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>
          <option value="">{t("audit.anyAction")}</option>
          {prefixes.map((p) => <option key={p} value={p}>{t("audit.allOf", { area: p.slice(0, -1) })}</option>)}
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">{t("audit.from")}
          <input type="date" className={control} value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm text-muted">{t("audit.to")}
          <input type="date" className={control} value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} /></label>
        <Button type="submit" variant="secondary">{t("common.search")}</Button>
      </form>

      <Panel className="overflow-hidden">
        {!data ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          : data.items.length === 0 ? <EmptyState icon={<ScrollText className="h-6 w-6" />} title={t("audit.empty")} body={t("list.emptyFiltered")} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[15px]">
              <thead className="border-b border-line bg-sunken/50 text-sm text-muted">
                <tr>{(["audit.when", "audit.who", "audit.action", "audit.about", "audit.details", "audit.ip"] as MessageKey[]).map((h) =>
                  <th key={h} scope="col" className="px-4 py-2 font-semibold">{t(h)}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((e) => {
                  const link = entityLink(e);
                  const about = e.entity_type ? `${e.entity_type} #${e.entity_id ?? ""}` : "—";
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted">{dateTime(e.at, locale)}</td>
                      <td className="px-4 py-2">{e.actor ?? <span className="text-muted">{t("audit.system")}</span>}</td>
                      <td className="px-4 py-2 font-mono text-sm">{e.action}</td>
                      <td className="px-4 py-2">{link ? <Link className="text-info hover:underline" to={link}>{about}</Link> : about}</td>
                      <td className="max-w-[360px] break-words px-4 py-2 text-sm text-muted">{summary(e.details)}</td>
                      <td className="px-4 py-2 font-mono text-sm text-muted">{e.ip_address ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
            <span>{t("common.range", { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, data.total), total: data.total })}</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t("common.prevPage")}><ChevronLeft className="h-5 w-5" /></Button>
              <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label={t("common.nextPage")}><ChevronRight className="h-5 w-5" /></Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
