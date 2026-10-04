import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, FilePlus2, Search, TriangleAlert, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { hazardCategoryKey } from "@/i18n/labels";
import { api } from "@/services/api";
import type { SearchResults } from "@/types/people";
import { cn } from "@/utils/cn";

type Hit = { key: string; to: string; icon: typeof Search; title: string; sub: string };

/** Header search: reports, people and departments, each within what you're allowed to see. Ctrl+K or / opens it. */
export function GlobalSearch() {
  const { t } = useT();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResults | null>(null);
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); input.current?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const timer = window.setTimeout(() => {
      api.search(q.trim()).then((r) => { setRes(r); setActive(0); }).catch(() => setRes(null));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const hits: Hit[] = res ? [
    ...res.incidents.map((i) => ({ key: `i${i.id}`, to: `/app/reports/incidents/${i.id}`, icon: FilePlus2, title: i.title,
      sub: `${i.reference} · ${t("detail.incident")}` })),
    ...res.hazards.map((h) => ({ key: `h${h.id}`, to: `/app/reports/hazards/${h.id}`, icon: TriangleAlert,
      title: t(hazardCategoryKey(h.category)), sub: `${h.reference} · ${h.description.slice(0, 60)}` })),
    ...res.people.map((p) => ({ key: `p${p.id}`, to: `/app/people/${p.id}`, icon: UserRound, title: p.full_name,
      sub: [p.employee_id, p.department].filter(Boolean).join(" · ") })),
    ...res.departments.map((d) => ({ key: `d${d.id}`, to: `/app/departments/${d.id}`, icon: Building2, title: d.name, sub: d.code })),
  ] : [];

  const go = (h: Hit) => { setOpen(false); setQ(""); nav(h.to); };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t("search.open")} title={t("search.shortcut")}>
        <Search className="h-5 w-5" />
      </Button>
      <dialog ref={dialog} onCancel={(e) => { e.preventDefault(); setOpen(false); }} aria-label={t("search.title")}
        onClick={(e) => { if (e.target === dialog.current) setOpen(false); }}
        className="mt-[10vh] w-[min(94vw,600px)] rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-black/50">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search.placeholder")}
            aria-label={t("search.title")} aria-controls="search-results" aria-activedescendant={hits[active] ? `sr-${hits[active].key}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter" && hits[active]) go(hits[active]);
            }}
            className="h-14 flex-1 bg-transparent text-[17px] focus:outline-none" />
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("common.dismiss")}><X className="h-5 w-5" /></Button>
        </div>
        <ul id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {q.trim().length < 2 ? <li className="px-3 py-6 text-center text-muted">{t("search.hint")}</li>
            : res && hits.length === 0 ? <li className="px-3 py-6 text-center text-muted">{t("search.none")}</li>
            : hits.map((h, i) => (
              <li key={h.key} id={`sr-${h.key}`} role="option" aria-selected={i === active}>
                <button type="button" onClick={() => go(h)} onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left", i === active && "bg-sunken")}>
                  <h.icon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0"><span className="block truncate font-semibold">{h.title}</span>
                    <span className="block truncate text-sm text-muted">{h.sub}</span></span>
                </button>
              </li>
            ))}
        </ul>
      </dialog>
    </>
  );
}
