import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, LogOut, Menu, Moon, Sun, UserCog, Users, X, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/layouts/AuthLayout";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/services/api";
import type { Role, SystemInfo } from "@/types/auth";
import { cn, homePathFor } from "@/utils/cn";

interface NavItem { to: string; label: string; icon: LucideIcon; roles: Role[] }

// Only modules that exist are listed. Each phase adds its routes here.
const NAV: NavItem[] = [
  { to: "/app/worker", label: "My safety", icon: LayoutDashboard, roles: ["worker"] },
  { to: "/app/supervisor", label: "Overview", icon: LayoutDashboard, roles: ["supervisor"] },
  { to: "/app/admin", label: "Overview", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/app/admin/users", label: "People & access", icon: Users, roles: ["admin"] },
  { to: "/app/profile", label: "My profile", icon: UserCog, roles: ["worker", "supervisor", "admin"] },
];

const ROLE_LABEL: Record<Role, string> = { worker: "Worker", supervisor: "Supervisor", admin: "Administrator" };

function Nav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-1">
      {NAV.filter((n) => n.roles.includes(role)).map((n) => (
        <NavLink key={n.to} to={n.to} end onClick={onNavigate}
          className={({ isActive }) => cn(
            "flex min-h-[44px] items-center gap-3 rounded-md px-3 text-[15px] font-medium transition-colors",
            isActive ? "bg-ink text-bg" : "text-muted hover:bg-sunken hover:text-ink",
          )}>
          <n.icon className="h-[18px] w-[18px]" aria-hidden />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => { api.systemInfo().then(setInfo).catch(() => {}); }, []);
  if (!user) return null;

  const signOut = async () => { await logout(); nav("/login", { replace: true }); };

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1"><BrandMark /></div>
      <Nav role={user.role} onNavigate={() => setOpen(false)} />
      <div className="mt-auto space-y-3 rounded-md border border-line p-3">
        <div>
          <p className="truncate font-semibold">{user.full_name}</p>
          <p className="truncate text-sm text-muted">{ROLE_LABEL[user.role]}{user.department ? `, ${user.department.name}` : ""}</p>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-signal focus:px-4 focus:py-2 focus:text-signal-ink">
        Skip to content
      </a>
      <aside className="hidden border-r border-line bg-surface lg:block lg:sticky lg:top-0 lg:h-dvh">{sidebar}</aside>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
            <motion.aside role="dialog" aria-label="Navigation" className="absolute inset-y-0 left-0 w-[280px] bg-surface"
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "tween", duration: 0.2 }}>
              <Button variant="ghost" size="icon" className="absolute right-3 top-3" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </Button>
              {sidebar}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {info?.demo_data && <Badge tone="signal">Demo data</Badge>}
            {info?.ai_demo_mode && <Badge tone="info" >Demo AI mode</Badge>}
          </div>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export { homePathFor };
