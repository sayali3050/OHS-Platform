import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useT } from "@/i18n";
import { roleKey } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import type { Page, Role, User } from "@/types/auth";
import { useAuth } from "@/hooks/useAuth";

const PAGE_SIZE = 15;
const control = "h-11 rounded-md border border-line bg-surface px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-signal";

type Pending = { user: User; activate: boolean } | null;

export default function UsersPage() {
  const { user: me } = useAuth();
  const { t } = useT();
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
    }).then(setData).catch((e) => toast.error(e instanceof ApiError ? e.message : t("users.loadFailed")));
  }, [params, role, status, page, t]);
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
      toast.success(t(confirm.activate ? "users.activated" : "users.deactivated", { name: confirm.user.full_name }));
      setConfirm(null);
      load();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : t("users.updateFailed")); }
    finally { setBusy(false); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const isApproval = confirm?.activate && confirm.user.role === "supervisor";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold">{t("users.title")}</h1>
        <p className="mt-1 text-muted">{t("users.subtitle")}</p>
      </div>

      <form role="search" className="flex flex-col gap-3 md:flex-row" onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="user-q" className="sr-only">{t("users.searchLabel")}</label>
          <input id="user-q" className={`${control} w-full pl-9`} placeholder={t("users.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="sr-only" htmlFor="f-role">{t("users.colRole")}</label>
        <select id="f-role" className={control} value={role} onChange={(e) => update({ role: e.target.value })}>
          <option value="">{t("users.allRoles")}</option><option value="worker">{t("users.workers")}</option>
          <option value="supervisor">{t("users.supervisors")}</option><option value="admin">{t("users.admins")}</option>
        </select>
        <label className="sr-only" htmlFor="f-status">{t("users.colStatus")}</label>
        <select id="f-status" className={control} value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">{t("users.anyStatus")}</option><option value="active">{t("users.active")}</option>
          <option value="pending">{t("users.pending")}</option><option value="inactive">{t("users.inactive")}</option>
        </select>
        <Button type="submit" variant="secondary">{t("common.search")}</Button>
      </form>

      <Panel className="overflow-hidden">
        {!data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title={t("users.emptyTitle")} body={t("users.emptyBody")}
            action={<Button variant="outline" onClick={() => { setQ(""); setParams({}); }}>{t("common.clearFilters")}</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[15px]">
              <thead className="border-b border-line bg-sunken/60 text-sm text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("users.colName")}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("users.colEmployeeId")}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("users.colRole")}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("users.colDepartment")}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("users.colStatus")}</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">{t("users.colActions")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((u) => (
                  <tr key={u.id} className="hover:bg-sunken/40">
                    <td className="px-4 py-3"><p className="font-semibold">{u.full_name}</p><p className="text-sm text-muted">{u.email}</p></td>
                    <td className="px-4 py-3 tabular-nums">{u.employee_id}</td>
                    <td className="px-4 py-3">{t(roleKey(u.role))}</td>
                    <td className="px-4 py-3">{u.department?.name ?? <span className="text-muted">{t("common.none")}</span>}</td>
                    <td className="px-4 py-3">
                      {u.is_active ? <Badge tone="safe">{t("users.active")}</Badge>
                        : u.role === "supervisor" ? <Badge tone="caution">{t("users.pending")}</Badge>
                        : <Badge>{t("users.inactive")}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== me?.id && (u.is_active
                        ? <Button size="sm" variant="ghost" onClick={() => setConfirm({ user: u, activate: false })}>{t("users.deactivate")}</Button>
                        : <Button size="sm" variant="secondary" onClick={() => setConfirm({ user: u, activate: true })}>
                            {u.role === "supervisor" ? t("users.approve") : t("users.activate")}
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
            <span>{t("common.range", { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, data.total), total: data.total })}</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label={t("common.prevPage")}><ChevronLeft className="h-5 w-5" /></Button>
              <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })} aria-label={t("common.nextPage")}><ChevronRight className="h-5 w-5" /></Button>
            </div>
          </div>
        )}
      </Panel>

      <ConfirmDialog open={!!confirm} busy={busy} onCancel={() => setConfirm(null)} onConfirm={applyConfirm}
        tone={confirm?.activate ? "primary" : "danger"}
        title={confirm?.activate ? t(isApproval ? "users.approveTitle" : "users.activateTitle") : t("users.deactivateTitle")}
        confirmLabel={confirm?.activate ? t(isApproval ? "users.approve" : "users.activate") : t("users.deactivate")}
        body={confirm && (confirm.activate
          ? t("users.activateBody", { name: confirm.user.full_name, role: t(roleKey(confirm.user.role)) })
          : t("users.deactivateBody", { name: confirm.user.full_name }))} />
    </div>
  );
}
