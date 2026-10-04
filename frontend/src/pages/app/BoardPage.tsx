import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, UserRound } from "lucide-react";
import { Badge, Skeleton } from "@/components/ui/misc";
import { SeverityBadge } from "@/components/reports/badges";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { statusKey } from "@/i18n/labels";
import { api } from "@/services/api";
import type { Department } from "@/types/auth";
import type { BoardCard } from "@/types/people";
import { INCIDENT_FLOW } from "@/types/reports";
import { cn } from "@/utils/cn";

/** /app/board: every open incident in its workflow column, so nothing waits unseen. */
export default function BoardPage() {
  const { t } = useT();
  const { user } = useAuth();
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [depts, setDepts] = useState<Department[]>([]);
  const [dept, setDept] = useState("");
  const admin = user?.role === "admin";

  useEffect(() => { if (admin) api.auth.departments().then(setDepts).catch(() => {}); }, [admin]);
  useEffect(() => {
    setCards(null);
    api.incidents.board(dept ? Number(dept) : null).then(setCards).catch(() => setCards([]));
  }, [dept]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] font-bold">{t("board.title")}</h1>
          <p className="mt-1 text-muted">{t("board.subtitle")}</p>
        </div>
        {admin && (
          <label className="flex items-center gap-2 text-[15px]">
            <span className="text-muted">{t("register.department")}</span>
            <select value={dept} onChange={(e) => setDept(e.target.value)}
              className="h-11 rounded-md border border-line bg-surface px-3 focus:outline-none focus:ring-2 focus:ring-signal">
              <option value="">{t("board.allDepts")}</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[1100px] grid-cols-6 gap-3">
          {INCIDENT_FLOW.map((s) => {
            const col = cards?.filter((c) => c.status === s) ?? [];
            return (
              <section key={s} aria-label={t(statusKey(s, "incident"))} className="flex flex-col rounded-lg bg-sunken/60 p-2">
                <h2 className="flex items-center justify-between px-1.5 pb-2 pt-1 font-sans text-sm font-bold">
                  {t(statusKey(s, "incident"))}<span className="rounded-full bg-surface px-2 text-muted tabular-nums">{cards ? col.length : "…"}</span>
                </h2>
                <ul className="space-y-2">
                  {!cards ? [0, 1].map((i) => <li key={i}><Skeleton className="h-24" /></li>) : col.map((c) => (
                    <li key={c.id}>
                      <Link to={`/app/reports/incidents/${c.id}`}
                        className={cn("block rounded-md border bg-surface p-3 text-sm shadow-sm transition-colors hover:border-ink",
                          c.actions_overdue > 0 || (s === "reported" && c.days_open >= 1) ? "border-l-4 border-line border-l-danger" : "border-line")}>
                        <p className="text-xs font-semibold tabular-nums text-muted">{c.reference}</p>
                        <p className="mt-0.5 line-clamp-2 font-semibold leading-snug">{c.title}</p>
                        <div className="mt-2 flex flex-wrap gap-1"><SeverityBadge severity={c.severity} />
                          {c.injury_occurred && <Badge tone="danger">{t("detail.injury")}</Badge>}</div>
                        <p className="mt-2 flex items-center gap-1 text-muted"><UserRound className="h-3.5 w-3.5" aria-hidden />{c.investigator ?? t("detail.notAssigned")}</p>
                        <p className="flex items-center gap-1 text-muted"><Clock className="h-3.5 w-3.5" aria-hidden />{t("board.days", { n: c.days_open })}
                          {admin && c.department ? ` · ${c.department}` : ""}</p>
                        {c.actions_open > 0 && (
                          <p className={cn("mt-1 flex items-center gap-1 font-semibold", c.actions_overdue ? "text-danger" : "text-muted")}>
                            {c.actions_overdue > 0 && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                            {t(c.actions_overdue ? "board.actionsOverdue" : "board.actionsOpen", { n: c.actions_open, late: c.actions_overdue })}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                  {cards && col.length === 0 && <li className="px-1.5 py-3 text-sm text-muted">{t("board.empty")}</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
