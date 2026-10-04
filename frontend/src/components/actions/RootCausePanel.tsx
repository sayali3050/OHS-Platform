import { useState } from "react";
import { toast } from "sonner";
import { GitBranch, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { Badge, Panel } from "@/components/ui/misc";
import { useT, type MessageKey } from "@/i18n";
import { api, ApiError } from "@/services/api";
import type { Incident, RootCauseSuggestion } from "@/types/reports";

const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Root cause: the AI drafts a 5 Whys chain; the investigator checks it and records the cause in their own words. */
export function RootCausePanel({ incident, onChange, onActionAdded }: {
  incident: Incident; onChange: (i: Incident) => void; onActionAdded: () => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(incident.root_cause ?? "");
  const [error, setError] = useState("");
  const s: RootCauseSuggestion | null = incident.root_cause_suggestion;
  const manage = incident.can_manage && incident.status !== "closed";

  // Nothing to show: no confirmed cause, and either the viewer can't work on it or the incident is closed.
  if (!incident.root_cause && !manage) return null;

  async function suggest() {
    setBusy(true);
    try { onChange(await api.incidents.suggestRootCause(incident.id)); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : t("rca.failed")); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      onChange(await api.incidents.setRootCause(incident.id, text.trim()));
      setEditing(false);
      toast.success(t("rca.saved"));
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields.root_cause ?? e.message) : t("rca.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function addAction(description: string, control_level: string) {
    try {
      await api.actions.create({ kind: "corrective", incident_id: incident.id, description, due_date: inDays(14),
        control_level: control_level as never, responsible_id: null, priority: "medium" });
      toast.success(t("capa.added"));
      onActionAdded();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("capa.failed"));
    }
  }

  return (
    <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold"><GitBranch className="h-5 w-5" aria-hidden />{t("rca.title")}</h2>
        {manage && <Button variant="outline" size="sm" loading={busy && !editing} onClick={suggest}>
          {!busy && <Sparkles className="h-4 w-4" aria-hidden />} {s ? t("rca.again") : t("rca.suggest")}
        </Button>}
      </div>

      {incident.root_cause && !editing && (
        <div className="rounded-md border-l-4 border-safe bg-safe/5 px-4 py-3">
          <p className="text-sm font-semibold text-muted">{t("rca.confirmed")}</p>
          <p className="mt-0.5 whitespace-pre-wrap">{incident.root_cause}</p>
          {manage && <Button variant="link" size="sm" onClick={() => { setText(incident.root_cause ?? ""); setEditing(true); }}>{t("rca.edit")}</Button>}
        </div>
      )}

      {manage && s && (
        <div role="region" aria-label={t("rca.suggestion")} className="space-y-3 rounded-md border border-info/40 bg-info/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-info" aria-hidden /><span className="font-semibold">{t("rca.suggestion")}</span>
            <Badge tone="info">{s.demo_mode ? t("common.demoAi") : t("common.liveAi")}</Badge>
            <Badge tone="neutral">{t(`rca.conf.${s.confidence}` as MessageKey)}</Badge>
          </div>
          <ol className="space-y-2">
            {s.whys.map((w, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-bold text-bg">{i + 1}</span>
                <span><span className="block text-sm text-muted">{w.question}</span><span className="block font-medium">{w.answer}</span></span>
              </li>
            ))}
          </ol>
          <div><p className="text-sm font-semibold text-muted">{t("rca.rootCause")}</p><p className="font-semibold">{s.root_cause}</p></div>
          {s.contributing_factors.length > 0 && (
            <div><p className="text-sm font-semibold text-muted">{t("rca.factors")}</p>
              <ul className="list-disc pl-5 text-[15px]">{s.contributing_factors.map((f) => <li key={f}>{f}</li>)}</ul></div>
          )}
          <div>
            <p className="text-sm font-semibold text-muted">{t("rca.actions")}</p>
            <ul className="mt-1 space-y-1.5">
              {s.suggested_actions.map((a) => (
                <li key={a.description} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2">
                  <span className="text-[15px]">{a.description} <span className="text-sm text-muted">({t(`capa.level.${a.control_level}` as MessageKey)})</span></span>
                  <Button size="sm" variant="ghost" onClick={() => addAction(a.description, a.control_level)}>
                    <Plus className="h-4 w-4" aria-hidden /> {t("rca.addAction")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm font-medium text-muted">{t("rca.check")}</p>
          {!editing && <Button size="sm" variant="secondary" onClick={() => { setText(s.root_cause); setEditing(true); }}>{t("rca.use")}</Button>}
        </div>
      )}

      {manage && (editing || (!incident.root_cause && !s)) && (
        <div className="space-y-2">
          <TextAreaField label={t("rca.yourWords")} hint={t("rca.hint")} rows={3} maxLength={2000} value={text}
            onChange={(e) => setText(e.target.value)} error={error || undefined} />
          <div className="flex gap-2">
            <Button size="sm" loading={busy && editing} disabled={text.trim().length < 10} onClick={save}>{t("rca.save")}</Button>
            {editing && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>}
          </div>
        </div>
      )}
    </Panel>
  );
}
