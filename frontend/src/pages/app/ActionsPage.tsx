import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { ActionItem } from "@/components/actions/ActionItem";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { api } from "@/services/api";
import type { ActionPage, CapaAction } from "@/types/people";
import { cn } from "@/utils/cn";

const PAGE_SIZE = 20;
const STATES = ["open", "overdue", "completed"] as const;

/** /app/actions: what I have to do, and (for staff) every action on my department's reports. */
export default function ActionsPage() {
  const { t } = useT();
  const { user } = useAuth();
  const staff = user?.role !== "worker";
  const [params, setParams] = useSearchParams();
  const scope = staff && params.get("scope") === "team" ? "team" : "mine";
  const state = (STATES as readonly string[]).includes(params.get("state") ?? "") ? params.get("state")! : "open";
  const page = Number(params.get("page") ?? 1);
  const [data, setData] = useState<ActionPage | null>(null);

  useEffect(() => {
    setData(null);
    api.actions.list({ scope, state, page, page_size: PAGE_SIZE }).then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, page_size: PAGE_SIZE, counts: { open: 0, overdue: 0, completed: 0 } }));
  }, [scope, state, page]);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };
  const replace = (a: CapaAction) => setData((d) => d && { ...d, items: d.items.map((x) => (x.id === a.id && x.kind === a.kind ? a : x)) });
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold">{t("capa.pageTitle")}</h1>
        <p className="mt-1 text-muted">{t(scope === "mine" ? "capa.pageMine" : "capa.pageTeam")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {staff && (
          <div role="tablist" aria-label={t("capa.scope")} className="inline-flex rounded-md border border-line bg-surface p-1">
            {(["mine", "team"] as const).map((s) => (
              <button key={s} role="tab" type="button" aria-selected={scope === s} onClick={() => set({ scope: s === "mine" ? "" : s })}
                className={cn("min-h-[40px] rounded px-4 text-[15px] font-semibold", scope === s ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
                {t(`capa.scope.${s}` as MessageKey)}
              </button>
            ))}
          </div>
        )}
        <div role="tablist" aria-label={t("capa.filter")} className="inline-flex rounded-md border border-line bg-surface p-1">
          {STATES.map((s) => (
            <button key={s} role="tab" type="button" aria-selected={state === s} onClick={() => set({ state: s === "open" ? "" : s })}
              className={cn("min-h-[40px] rounded px-4 text-[15px] font-semibold", state === s ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
              {t(`capa.filter.${s}` as MessageKey)}{data ? ` (${data.counts[s]})` : ""}
            </button>
          ))}
        </div>
      </div>

      <Panel className="overflow-hidden">
        {!data ? <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          : data.items.length === 0 ? (
            <EmptyState icon={<ListChecks className="h-6 w-6" />} title={t("capa.emptyTitle")} body={t("capa.emptyBody")} />
          ) : (
            <ul className="divide-y divide-line">
              {data.items.map((a) => <li key={`${a.kind}-${a.id}`}><ActionItem action={a} onChange={replace} showReport
                onRemove={(r) => setData((d) => d && { ...d, items: d.items.filter((x) => !(x.id === r.id && x.kind === r.kind)) })} /></li>)}
            </ul>
          )}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
            <span>{t("common.range", { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, data.total), total: data.total })}</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label={t("common.prevPage")}><ChevronLeft className="h-5 w-5" /></Button>
              <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} aria-label={t("common.nextPage")}><ChevronRight className="h-5 w-5" /></Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
