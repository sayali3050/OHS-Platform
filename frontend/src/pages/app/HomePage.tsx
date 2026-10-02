import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, IdCard, Languages, Mail, UserCheck } from "lucide-react";
import { Badge, Panel, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/services/api";
import { LANGUAGES } from "@/types/auth";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Worker and supervisor landing screen. Later phases add the safety score, quick actions and alerts here. */
export function RoleHome() {
  const { user } = useAuth();
  if (!user) return null;
  const lang = LANGUAGES.find((l) => l.value === user.preferred_language);
  const rows = [
    { icon: IdCard, label: "Employee ID", value: user.employee_id },
    { icon: Building2, label: "Department", value: user.department?.name ?? "Not assigned" },
    { icon: Mail, label: "Email", value: user.email },
    { icon: Languages, label: "Language", value: lang ? `${lang.native} (${lang.label})` : user.preferred_language },
  ];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted">{greeting()},</p>
        <h1 className="text-[32px] font-bold">{user.full_name.split(" ")[0]}</h1>
      </div>
      <Panel className="max-w-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">Your account</h2>
          <Badge tone="safe"><UserCheck className="h-3.5 w-3.5" aria-hidden /> Active</Badge>
        </div>
        <dl className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-4 px-5 py-3.5">
              <r.icon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              <dt className="w-24 shrink-0 text-muted sm:w-32">{r.label}</dt>
              <dd className="min-w-0 break-words font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-line px-5 py-4">
          <Button variant="outline" asChild><Link to="/app/profile">Edit profile</Link></Button>
        </div>
      </Panel>
    </div>
  );
}

export function AdminOverview() {
  const [stats, setStats] = useState<{ total: number; workers: number; supervisors: number; pending: number } | null>(null);
  useEffect(() => {
    Promise.all([
      api.users.list({ page_size: 1 }),
      api.users.list({ page_size: 1, role: "worker" }),
      api.users.list({ page_size: 1, role: "supervisor", is_active: true }),
      api.users.list({ page_size: 1, role: "supervisor", is_active: false }),
    ]).then(([a, w, s, p]) => setStats({ total: a.total, workers: w.total, supervisors: s.total, pending: p.total }));
  }, []);

  const cards = stats && [
    { label: "People on the platform", value: stats.total },
    { label: "Workers", value: stats.workers },
    { label: "Active supervisors", value: stats.supervisors },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-[32px] font-bold">Organisation overview</h1>
      {stats && stats.pending > 0 && (
        <Panel className="flex flex-col gap-3 border-l-4 border-l-caution p-5 sm:flex-row sm:items-center sm:justify-between">
          <p><span className="font-semibold">{stats.pending} supervisor {stats.pending === 1 ? "account is" : "accounts are"} waiting for approval.</span>
            <span className="text-muted"> They can't sign in until you approve them.</span></p>
          <Button variant="secondary" asChild><Link to="/app/admin/users?status=pending">Review requests</Link></Button>
        </Panel>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {cards ? cards.map((c) => (
          <Panel key={c.label} className="p-5">
            <p className="text-muted">{c.label}</p>
            <p className="mt-1 font-display text-4xl font-bold tabular-nums">{c.value}</p>
          </Panel>
        )) : [0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px]" />)}
      </div>
    </div>
  );
}
