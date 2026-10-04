import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { api } from "@/services/api";
import type { Notification } from "@/types/reports";
import { cn } from "@/utils/cn";
import { timeAgo } from "@/utils/format";

const POLL_MS = 60_000;
const DOT = { info: "bg-info", warning: "bg-caution", critical: "bg-danger" } as const;

/** Header bell. Polls a cheap count endpoint; the full list is only fetched when the panel opens. */
export function NotificationBell() {
  const nav = useNavigate();
  const { t, locale } = useT();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    if (document.visibilityState === "visible") api.notifications.unreadCount().then((r) => setUnread(r.unread)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, POLL_MS);
    document.addEventListener("visibilitychange", refreshCount);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refreshCount); };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    setItems(null);
    api.notifications.list().then((r) => { setItems(r.items); setUnread(r.unread); }).catch(() => setItems([]));
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function openItem(n: Notification) {
    if (!n.read_at) {
      api.notifications.markRead(n.id).catch(() => {});
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? null);
    }
    if (n.link) { setOpen(false); nav(n.link); }
  }

  async function readAll() {
    await api.notifications.markAllRead().catch(() => {});
    setUnread(0);
    setItems((list) => list?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? null);
  }

  const label = unread ? t("bell.labelUnread", { count: unread }) : t("bell.label");
  return (
    <div ref={root} className="relative">
      <Button variant="ghost" size="icon" aria-label={label} aria-expanded={open} aria-haspopup="true"
        onClick={() => setOpen((o) => !o)} className="relative">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span aria-hidden className="absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div role="region" aria-label={t("bell.label")}
          className="fixed inset-x-3 top-[68px] z-50 overflow-hidden rounded-lg border border-line bg-surface shadow-panel sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="font-sans text-base font-bold">{t("bell.label")}</h2>
            <Button variant="ghost" size="sm" onClick={readAll} disabled={!unread}>
              <CheckCheck className="h-4 w-4" aria-hidden /> {t("bell.markAll")}
            </Button>
          </div>
          <div className="max-h-[min(70vh,480px)] overflow-y-auto">
            {!items ? (
              <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-muted">
                <Inbox className="h-6 w-6" aria-hidden /> {t("bell.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => openItem(n)}
                      className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-sunken/60", !n.read_at && "bg-info/5")}>
                      <span aria-hidden className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : DOT[n.priority])} />
                      <span className="min-w-0">
                        <span className={cn("block text-[15px] leading-snug", !n.read_at && "font-semibold")}>
                          {n.priority === "critical" && <span className="sr-only">{t("bell.urgent")}</span>}{n.title}
                        </span>
                        {n.body && <span className="mt-0.5 block text-sm text-muted">{n.body}</span>}
                        <span className="mt-1 block text-xs text-muted">
                          {timeAgo(n.created_at, t, locale)}{!n.read_at && <span className="sr-only">{t("bell.unread")}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
