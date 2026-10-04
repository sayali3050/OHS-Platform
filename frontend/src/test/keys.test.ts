import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { hi } from "@/i18n/hi";
import { mr } from "@/i18n/mr";
import { BODY_AREAS, DRUDGERY_FACTORS, EXPOSURES, FEELINGS, POSTURES } from "@/types/assess";
import { CHECK_TYPES, CONTROL_LEVELS, GENDERS, HEALTH_RESULTS, RISK_LEVELS, SHIFTS } from "@/types/people";

/** Keys built at runtime (`ergo.f.${code}`) aren't checked by TypeScript, so check them here against the codes the
 * server can send. A missing key would show the raw code on screen. */
const SERVER_ERGO_FACTORS = ["heavy_load", "moderate_load", "frequent_lifting", ...POSTURES, "repetitive_hand", "vibration",
  "pushing_pulling", "long_hours", "high_discomfort", "some_discomfort", "many_areas"];
const SERVER_ERGO_RECS = ["see_health", "report_discomfort", "task_review", "keep_going", "heavy_load", "moderate_load",
  "frequent_lifting", ...POSTURES, "repetitive_hand", "vibration", "pushing_pulling", "long_hours"];

const dynamic = [
  ...SERVER_ERGO_FACTORS.map((k) => `ergo.f.${k}`), ...SERVER_ERGO_RECS.map((k) => `ergo.r.${k}`),
  ...BODY_AREAS.map((k) => `ergo.a.${k}`), ...DRUDGERY_FACTORS.flatMap((k) => [`drud.f.${k}`, `drud.fh.${k}`, `drud.i.${k}`]),
  ...FEELINGS.map((k) => `well.f.${k}`), ...EXPOSURES.map((k) => `risk.exp.${k}`), ...RISK_LEVELS.map((k) => `risk.band.${k}`),
  ...[1, 2, 3, 4, 5].flatMap((n) => [`risk.l${n}`, `risk.s${n}`]), ...CONTROL_LEVELS.map((k) => `capa.level.${k}`),
  ...GENDERS.map((k) => `gender.${k}`), ...SHIFTS.map((k) => `shift.${k}`), ...HEALTH_RESULTS.map((k) => `health.result.${k}`),
  ...CHECK_TYPES.map((k) => `health.type.${k}`), ...["low", "medium", "high"].map((k) => `rca.conf.${k}`),
  ...["sop", "manual", "policy", "msds", "other"].map((k) => `kb.t.${k}`),
  ...["category", "department", "location"].map((k) => `an.kind.${k}`),
  ...["insights", "copilot", "monthly", "export"].map((k) => `an.tab.${k}`),
  ...["incidents", "hazards", "actions", "risks"].map((k) => `an.export.${k}`),
  ...["report", "safety", "learn", "manage", "you"].map((k) => `nav.g.${k}`),
  ...["yes", "no", "na"].map((k) => `chk.${k}`), ...["pending", "in_progress", "completed", "overdue"].map((k) => `capa.state.${k}`),
  ...["valid", "expiring", "expired", "in_progress", "not_started"].map((k) => `training.${k}`),
  ...["ok", "due_soon", "overdue", "damaged", "missing"].map((k) => `ppe.${k}`),
  ...["low", "moderate", "high"].map((k) => `drud.level.${k}`),
];

test("every runtime-built key exists in all four languages", () => {
  for (const dict of [en, hi, mr, de]) {
    const missing = dynamic.filter((k) => !(k in dict));
    expect(missing).toEqual([]);
  }
});

test("all four dictionaries have exactly the same keys", () => {
  const keys = Object.keys(en).sort();
  for (const dict of [hi, mr, de]) expect(Object.keys(dict).sort()).toEqual(keys);
});
