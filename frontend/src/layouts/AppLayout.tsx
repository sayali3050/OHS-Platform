import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot, Building2, ClipboardList, Columns3, FilePlus2, Info, LayoutDashboard, ListChecks, LogOut, Menu, Moon, ScrollText,
  ShieldAlert, Sun, TriangleAlert, UserCog, Users, X, type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearch } from "@/components/GlobalSearch";
import { EmergencyAlarmProvider, EmergencyBanner } from "@/components/EmergencyAlarm";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandMark } from "@/layouts/AuthLayout";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useT, type MessageKey } from "@/i18n";
import { roleKey } from "@/i18n/labels";
import { api } from "@/services/api";
import type { Role, SystemInfo } from "@/types/auth";
import { cn, homePathFor } from "@/utils/cn";

interface NavItem { to: string; label: MessageKey; icon: LucideIcon; roles: Role[] }

// Only modules that exist are listed. Each phase adds its routes here.
const NAV: NavItem[] = [
  { to: "/app/worker", label: "nav.mySafety", icon: LayoutDashboard, roles: ["worker"] },
  { to: "/app/supervisor", label: "nav.overview", icon: LayoutDashboard, roles: ["supervisor"] },
  { to: "/app/admin", label: "nav.overview", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/app/report/hazard", label: "nav.reportHazard", icon: TriangleAlert, roles: ["worker"] },
  { to: "/app/report/incident", label: "nav.reportIncident", icon: FilePlus2, roles: ["worker"] },
  { to: "/app/reports", label: "nav.myReports", icon: ClipboardList, roles: ["worker"] },
  { to: "/app/reports", label: "nav.reports", icon: ClipboardList, roles: ["supervisor", "admin"] },
  { to: "/app/board", label: "nav.board", icon: Columns3, roles: ["supervisor", "admin"] },
  { to: "/app/actions", label: "nav.actions", icon: ListChecks, roles: ["worker", "supervisor", "admin"] },
  { to: "/app/assistant", label: "nav.assistant", icon: Bot, roles: ["worker", "supervisor", "admin"] },
  { to: "/app/departments", label: "nav.departments", icon: Building2, roles: ["worker", "supervisor", "admin"] },
  { to: "/app/admin/users", label: "nav.people", icon: Users, roles: ["admin"] },
  { to: "/app/admin/audit", label: "nav.audit", icon: ScrollText, roles: ["admin"] },
  { to: "/app/emergency", label: "nav.emergency", icon: ShieldAlert, roles: ["worker", "supervisor", "admin"] },
  { to: "/app/profile", label: "nav.profile", icon: UserCog, roles: ["worker", "supervisor", "admin"] },
];

/** Demo badges explain themselves on tap: what's synthetic, and how the AI is (or isn't) connected. */
function SystemBadges({ info }: { info: SystemInfo }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="system-info"
        className="flex min-h-[40px] flex-wrap items-center gap-2 rounded-md px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal">
        {info.demo_data && <Badge tone="signal">{t("common.demoData")}</Badge>}
        <Badge tone="info">{info.ai_demo_mode ? t("common.demoAi") : t("common.liveAi")}</Badge>
        <Info className="h-4 w-4 text-muted" aria-label={t("sys.about")} />
      </button>
      {open && (
        <div id="system-info" role="region" aria-label={t("sys.about")}
          className="absolute left-0 top-12 z-50 w-[min(92vw,380px)] space-y-3 rounded-lg border border-line bg-surface p-4 text-[15px] shadow-panel">
          {info.demo_data && (
            <div><p className="font-semibold">{t("common.demoData")}</p><p className="text-muted">{t("sys.demoDataBody")}</p></div>
          )}
          <div>
            <p className="font-semibold">{info.ai_demo_mode ? t("common.demoAi") : t("common.liveAi")}</p>
            <p className="text-muted">{info.ai_demo_mode ? t("sys.demoAiBody") : t("sys.liveAiBody", { model: info.ai_model ?? "" })}</p>
          </div>
          <Link to="/app/assistant" onClick={() => setOpen(false)} className="inline-block font-semibold text-info hover:underline">
            {t("sys.tryAi")}
          </Link>
        </div>
      )}
    </div>
  );
}

function Nav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const { t } = useT();
  return (
    <nav aria-label={t("nav.main")} className="space-y-1">
      {NAV.filter((n) => n.roles.includes(role)).map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to !== "/app/reports" && n.to !== "/app/departments"} onClick={onNavigate}
          className={({ isActive }) => cn(
            "flex min-h-[44px] items-center gap-3 rounded-md px-3 text-[15px] font-medium transition-colors",
            isActive ? "bg-ink text-bg" : "text-muted hover:bg-sunken hover:text-ink",
          )}>
          <n.icon className="h-[18px] w-[18px]" aria-hidden />
          {t(n.label)}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const { t } = useT();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => { api.systemInfo().then(setInfo).catch(() => {}); }, []);
  if (!user) return null;

  const signOut = async () => { await logout(); nav("/login", { replace: true }); };

  const sidebar = (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <div className="px-2 pt-1"><BrandMark /></div>
      <Nav role={user.role} onNavigate={() => setOpen(false)} />
      <div className="mt-auto space-y-3 rounded-md border border-line p-3">
        <div>
          <p className="truncate font-semibold">{user.full_name}</p>
          <p className="truncate text-sm text-muted">{t(roleKey(user.role))}{user.department ? `, ${user.department.name}` : ""}</p>
        </div>
        <LanguageSwitcher className="w-full [&>select]:w-full" />
        <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
          <LogOut className="h-4 w-4" aria-hidden /> {t("common.signOut")}
        </Button>
      </div>
    </div>
  );

  return (
    <EmergencyAlarmProvider>
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-signal focus:px-4 focus:py-2 focus:text-signal-ink">
        {t("nav.skip")}
      </a>
      <aside className="hidden border-r border-line bg-surface lg:block lg:sticky lg:top-0 lg:h-dvh">{sidebar}</aside>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
            <motion.aside role="dialog" aria-label={t("nav.menu")} className="absolute inset-y-0 left-0 w-[280px] bg-surface"
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "tween", duration: 0.2 }}>
              <Button variant="ghost" size="icon" className="absolute right-3 top-3" onClick={() => setOpen(false)} aria-label={t("nav.closeMenu")}>
                <X className="h-5 w-5" />
              </Button>
              {sidebar}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur sm:gap-3 sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label={t("nav.openMenu")}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden sm:block">{info && <SystemBadges info={info} />}</div>
          <div className="ml-auto flex items-center gap-1">
            {/* Emergency is one tap away from every screen, not buried in the menu. */}
            <Button asChild variant="danger" size="sm" className="mr-1">
              <Link to="/app/emergency"><ShieldAlert className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{t("nav.emergency")}</span><span className="sr-only sm:hidden">{t("nav.emergency")}</span></Link>
            </Button>
            <GlobalSearch />
            <LanguageSwitcher className="[&>select]:max-w-[110px]" />
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? t("theme.toLight") : t("theme.toDark")}>
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </header>
        <EmergencyBanner />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
    </EmergencyAlarmProvider>
  );
}

export { homePathFor };
