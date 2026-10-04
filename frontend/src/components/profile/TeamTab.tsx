import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { RESULT_TONE } from "@/components/profile/HealthTab";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { roleKey } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import { LANGUAGES, type Department, type Language, type Page } from "@/types/auth";
import { SHIFTS, type PersonInput, type PersonSummary, type Shift } from "@/types/people";
import { shortDate } from "@/utils/format";

const PAGE_SIZE = 15;
const control = "h-11 rounded-md border border-line bg-surface px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-signal";

function AddPerson({ onCancel }: { onCancel: () => void }) {
  const { t } = useT();
  const { user } = useAuth();
  const nav = useNavigate();
  const admin = user?.role === "admin";
  const [depts, setDepts] = useState<Department[]>([]);
  const [f, setF] = useState({ full_name: "", email: "", employee_id: "", password: "", role: admin ? "supervisor" : "worker",
    department_id: "", phone: "", preferred_language: "en", designation: "", date_of_joining: "", shift: "morning" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (admin) api.auth.departments().then(setDepts).catch(() => {}); }, [admin]);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: PersonInput = {
        full_name: f.full_name.trim(), email: f.email.trim(), employee_id: f.employee_id.trim(), password: f.password,
        role: f.role as PersonInput["role"], department_id: admin && f.department_id ? Number(f.department_id) : null,
        phone: f.phone.trim() || null, preferred_language: f.preferred_language as Language,
        designation: f.designation.trim() || null, date_of_joining: f.date_of_joining || null, shift: f.shift as Shift,
      };
      const created = await api.people.create(body);
      toast.success(t("team.added", { name: created.full_name }));
      nav(`/app/people/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); if (!Object.keys(err.fields).length) toast.error(err.message); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">{admin ? t("team.addPerson") : t("team.addWorker")}</h2>
        <p className="text-sm text-muted">{admin ? t("team.addAdminHint") : t("team.addSupervisorHint")}</p>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {admin && (
            <SelectField label={t("register.role")} value={f.role} onChange={(e) => set("role", e.target.value)}>
              <option value="supervisor">{t("role.supervisor")}</option>
              <option value="worker">{t("role.worker")}</option>
            </SelectField>
          )}
          {admin && (
            <SelectField label={t("register.department")} value={f.department_id} error={errors.department_id}
              onChange={(e) => set("department_id", e.target.value)}>
              <option value="">{t("register.chooseDepartment")}</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectField>
          )}
          <TextField label={t("register.fullName")} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} error={errors.full_name} maxLength={120} />
          <TextField label={t("register.employeeId")} value={f.employee_id} onChange={(e) => set("employee_id", e.target.value)} error={errors.employee_id} maxLength={32} />
          <TextField label={t("register.workEmail")} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
          <TextField label={t("team.tempPassword")} hint={t("team.tempPasswordHint")} type="text" autoComplete="new-password"
            value={f.password} onChange={(e) => set("password", e.target.value)} error={errors.password} />
          <TextField label={t("register.phone")} type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} />
          <TextField label={t("prof.designation")} value={f.designation} onChange={(e) => set("designation", e.target.value)} maxLength={120} />
          <TextField label={t("prof.joined")} type="date" value={f.date_of_joining} onChange={(e) => set("date_of_joining", e.target.value)} />
          <SelectField label={t("prof.shift")} value={f.shift} onChange={(e) => set("shift", e.target.value)}>
            {SHIFTS.map((s) => <option key={s} value={s}>{t(`shift.${s}` as MessageKey)}</option>)}
          </SelectField>
          <SelectField label={t("register.language")} value={f.preferred_language} onChange={(e) => set("preferred_language", e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.native} ({l.label})</option>)}
          </SelectField>
        </div>
        <p className="text-sm text-muted">{t("team.moreLater")}</p>
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>{t("team.create")}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      </form>
    </Panel>
  );
}

/** Admins: supervisors (and workers). Supervisors: the workers in their department. */
export function TeamTab() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [role, setRole] = useState(admin ? "supervisor" : "worker");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<PersonSummary> | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setData(null);
    api.people.list({ q: search, role: admin ? role : undefined, page, page_size: PAGE_SIZE })
      .then(setData).catch(() => setData({ items: [], total: 0, page: 1, page_size: PAGE_SIZE }));
  }, [admin, role, search, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">{admin ? t("team.adminTitle") : t("team.supervisorTitle")}</h2>
          <p className="text-muted">{admin ? t("team.adminSubtitle") : t("team.supervisorSubtitle", { dept: user?.department?.name ?? "" })}</p>
        </div>
        {!adding && <Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" aria-hidden /> {admin ? t("team.addPerson") : t("team.addWorker")}</Button>}
      </div>
      {adding && <AddPerson onCancel={() => setAdding(false)} />}

      <form role="search" className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="team-q" className="sr-only">{t("users.searchLabel")}</label>
          <input id="team-q" className={`${control} w-full pl-9`} placeholder={t("users.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {admin && (
          <>
            <label htmlFor="team-role" className="sr-only">{t("register.role")}</label>
            <select id="team-role" className={control} value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
              <option value="supervisor">{t("users.supervisors")}</option>
              <option value="worker">{t("users.workers")}</option>
            </select>
          </>
        )}
        <Button type="submit" variant="secondary">{t("common.search")}</Button>
      </form>

      <Panel className="overflow-hidden">
        {!data ? <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          : data.items.length === 0 ? <EmptyState icon={<Users className="h-6 w-6" />} title={t("team.empty")} body={t("team.emptyBody")} /> : (
          <ul className="divide-y divide-line">
            {data.items.map((p) => (
              <li key={p.id}>
                <Link to={`/app/people/${p.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-sunken/50 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.full_name} <span className="text-sm font-normal text-muted">{p.employee_id}</span></p>
                    <p className="truncate text-sm text-muted">
                      {[p.designation, p.department, p.shift ? t(`shift.${p.shift}` as MessageKey) : null, p.phone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {!p.is_active && <Badge tone="neutral">{t("users.inactive")}</Badge>}
                    {admin && <Badge tone="neutral">{t(roleKey(p.role))}</Badge>}
                    {p.last_check_result && <Badge tone={RESULT_TONE[p.last_check_result]}>{t(`health.result.${p.last_check_result}` as MessageKey)}</Badge>}
                    {p.next_check_due && p.next_check_due < today && <Badge tone="danger">{t("team.checkOverdue", { date: shortDate(p.next_check_due, locale) })}</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
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
