import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api, ApiError } from "@/services/api";
import type { Page, Role, User } from "@/types/auth";
import { useAuth } from "@/hooks/useAuth";

const PAGE_SIZE = 15;
const control = "h-11 rounded-md border border-line bg-surface px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-signal";

type Pending = { user: User; activate: boolean } | null;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const role = (params.get("role") ?? "") as Role | "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [data, setData] = useState<Page<User> | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setData(null);
    api.users.list({
      q: params.get("q") ?? undefined, role: role || (status === "pending" ? "supervisor" : undefined),
      is_active: status === "active" ? true : status === "pending" || status === "inactive" ? false : undefined,
      page, page_size: PAGE_SIZE,
    }).then(setData).catch((e) => toast.error(e instanceof ApiError ? e.message : "Couldn't load people"));
  }, [params, role, status, page]);
  useEffect(load, [load]);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };

  async function applyConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.users.update(confirm.user.id, { is_active: confirm.activate });
      toast.success(`${confirm.user.full_name} ${confirm.activate ? "activated" : "deactivated"}`);
      setConfirm(null);
      load();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Update failed"); }
    finally { setBusy(false); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold">People & access</h1>
        <p className="mt-1 text-muted">Approve supervisor requests and control who can sign in.</p>
      </div>

      <form role="search" className="flex flex-col gap-3 md:flex-row" onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="user-q" className="sr-only">Search people</label>
          <input id="user-q" className={`${control} w-full pl-9`} placeholder="Name, email or employee ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="sr-only" htmlFor="f-role">Role</label>
        <select id="f-role" className={control} value={role} onChange={(e) => update({ role: e.target.value })}>
          <option value="">All roles</option><option value="worker">Workers</option>
          <option value="supervisor">Supervisors</option><option value="admin">Admins</option>
        </select>
        <label className="sr-only" htmlFor="f-status">Status</label>
        <select id="f-status" className={control} value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">Any status</option><option value="active">Active</option>
          <option value="pending">Awaiting approval</option><option value="inactive">Inactive</option>
        </select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>

      <Panel className="overflow-hidden">
        {!data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No one matches these filters"
            body="Clear the search or change the role and status filters."
            action={<Button variant="outline" onClick={() => { setQ(""); setParams({}); }}>Clear filters</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[15px]">
              <thead className="border-b border-line bg-sunken/60 text-sm text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Employee ID</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Department</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((u) => (
                  <tr key={u.id} className="hover:bg-sunken/40">
                    <td className="px-4 py-3"><p className="font-semibold">{u.full_name}</p><p className="text-sm text-muted">{u.email}</p></td>
                    <td className="px-4 py-3 tabular-nums">{u.employee_id}</td>
                    <td className="px-4 py-3 capitalize">{u.role}</td>
                    <td className="px-4 py-3">{u.department?.name ?? <span className="text-muted">None</span>}</td>
                    <td className="px-4 py-3">
                      {u.is_active ? <Badge tone="safe">Active</Badge>
                        : u.role === "supervisor" ? <Badge tone="caution">Awaiting approval</Badge>
                        : <Badge>Inactive</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== me?.id && (u.is_active
                        ? <Button size="sm" variant="ghost" onClick={() => setConfirm({ user: u, activate: false })}>Deactivate</Button>
                        : <Button size="sm" variant="secondary" onClick={() => setConfirm({ user: u, activate: true })}>
                            {u.role === "supervisor" ? "Approve" : "Activate"}
                          </Button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
            <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft className="h-5 w-5" /></Button>
              <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page"><ChevronRight className="h-5 w-5" /></Button>
            </div>
          </div>
        )}
      </Panel>

      <ConfirmDialog open={!!confirm} busy={busy} onCancel={() => setConfirm(null)} onConfirm={applyConfirm}
        tone={confirm?.activate ? "primary" : "danger"}
        title={confirm?.activate ? (confirm.user.role === "supervisor" ? "Approve supervisor access?" : "Activate this account?") : "Deactivate this account?"}
        confirmLabel={confirm?.activate ? (confirm.user.role === "supervisor" ? "Approve" : "Activate") : "Deactivate"}
        body={confirm && (confirm.activate
          ? <>{confirm.user.full_name} will be able to sign in as a {confirm.user.role}.</>
          : <>{confirm.user.full_name} will be signed out and can't sign in until reactivated. Their reports stay on record.</>)} />
    </div>
  );
}
