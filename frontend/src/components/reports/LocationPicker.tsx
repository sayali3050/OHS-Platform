import { useEffect, useState } from "react";
import { SelectField } from "@/components/ui/field";
import { useT } from "@/i18n";
import { api } from "@/services/api";
import type { DepartmentWithLocations } from "@/types/reports";

let cache: Promise<DepartmentWithLocations[]> | null = null;
const loadLocations = () => (cache ??= api.locations().catch((e) => { cache = null; throw e; }));

/** Department then area. Starts on the worker's own department, since that's where most reports come from. */
export function LocationPicker({ value, onChange, defaultDepartmentId, error }: {
  value: number | null; onChange: (id: number | null) => void; defaultDepartmentId?: number | null; error?: string;
}) {
  const { t } = useT();
  const [depts, setDepts] = useState<DepartmentWithLocations[] | null>(null);
  const [deptId, setDeptId] = useState<number | null>(defaultDepartmentId ?? null);

  useEffect(() => { loadLocations().then(setDepts).catch(() => setDepts([])); }, []);
  useEffect(() => {
    if (value && depts) setDeptId(depts.find((d) => d.locations.some((l) => l.id === value))?.id ?? deptId);
  }, [value, depts]); // deptId deliberately omitted: only re-sync when the value or data changes

  const dept = depts?.find((d) => d.id === deptId);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label={t("loc.department")} value={deptId ?? ""} disabled={!depts}
        onChange={(e) => { setDeptId(e.target.value ? Number(e.target.value) : null); onChange(null); }}>
        <option value="">{depts ? t("loc.chooseDepartment") : t("common.loading")}</option>
        {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </SelectField>
      <SelectField label={t("loc.exact")} value={value ?? ""} disabled={!dept} error={error}
        hint={!dept ? t("loc.deptFirst") : undefined}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{t("loc.unsure")}</option>
        {dept?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </SelectField>
    </div>
  );
}
