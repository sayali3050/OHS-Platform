import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, FileText, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { api, ApiError } from "@/services/api";
import type { KnowledgeDoc, KnowledgeDocDetail, KnowledgeHit } from "@/types/assess";
import { cn } from "@/utils/cn";
import { shortDate } from "@/utils/format";

const DOC_TYPES = ["sop", "manual", "policy", "msds", "other"] as const;

function UploadForm({ onDone }: { onDone: (d: KnowledgeDoc) => void }) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("sop");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onDone(await api.knowledge.upload(file, title.trim(), type));
      toast.success(t("kb.uploaded"));
      setTitle(""); setFile(null); if (input.current) input.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.file ?? err.message) : t("capa.failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div><h2 className="text-lg font-bold">{t("kb.upload")}</h2><p className="text-sm text-muted">{t("kb.uploadHint")}</p></div>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <TextField label={t("kb.docTitle")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <SelectField label={t("kb.type")} value={type} onChange={(e) => setType(e.target.value)}>
            {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`kb.t.${d}` as MessageKey)}</option>)}
          </SelectField>
        </div>
        <div>
          <label htmlFor="kb-file" className="mb-1.5 block text-sm font-semibold">{t("kb.file")}</label>
          <input ref={input} id="kb-file" type="file" accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-[15px] file:mr-3 file:h-11 file:rounded-md file:border-0 file:bg-sunken file:px-4 file:font-semibold" />
          {error && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{error}</p>}
        </div>
        <Button type="submit" loading={busy} disabled={!file || title.trim().length < 3}><Upload className="h-4 w-4" aria-hidden /> {t("kb.uploadBtn")}</Button>
      </form>
    </Panel>
  );
}

/** /app/knowledge */
export default function KnowledgePage() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const [docs, setDocs] = useState<KnowledgeDoc[] | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null);
  useEffect(() => { api.knowledge.list().then(setDocs).catch(() => setDocs([])); }, []);
  async function find(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setHits(await api.knowledge.search(q.trim()).catch(() => []));
  }
  return (
    <div className="space-y-6">
      <div><h1 className="text-[32px] font-bold">{t("kb.title")}</h1><p className="mt-1 text-muted">{t("kb.subtitle")}</p></div>
      <form role="search" onSubmit={find} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="kb-q" className="sr-only">{t("kb.search")}</label>
          <input id="kb-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("kb.search")}
            className="h-11 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
        <Button type="submit" variant="secondary">{t("common.search")}</Button>
      </form>
      {hits && (
        <Panel className="overflow-hidden">
          <h2 className="px-5 pt-4 text-lg font-bold">{t("kb.results")}</h2>
          {hits.length === 0 ? <p className="px-5 pb-5 pt-2 text-muted">{t("kb.noHits")}</p> : (
            <ul className="mt-2 divide-y divide-line border-t border-line">{hits.map((h) => (
              <li key={h.chunk_id}><Link to={`/app/knowledge/${h.document_id}#c${h.chunk_id}`} className="block px-5 py-3 hover:bg-sunken/50">
                <p className="font-semibold">{h.title}{h.heading ? <span className="font-normal text-muted"> › {h.heading}</span> : null}</p>
                <p className="line-clamp-2 text-[15px] text-muted">{h.snippet}</p></Link></li>))}</ul>
          )}
        </Panel>
      )}
      {user?.role === "admin" && <UploadForm onDone={(d) => setDocs((l) => [...(l ?? []), d].sort((a, b) => a.title.localeCompare(b.title)))} />}
      {!docs ? <Skeleton className="h-40" /> : docs.length === 0 ? <Panel><EmptyState icon={<FileText className="h-6 w-6" />} title={t("kb.none")} body={t("kb.noneBody")} /></Panel> : (
        <ul className="grid gap-3 md:grid-cols-2">{docs.map((d) => (
          <li key={d.id}><Link to={`/app/knowledge/${d.id}`} className="block h-full rounded-lg border border-line bg-surface p-5 hover:bg-sunken/40">
            <div className="flex items-start justify-between gap-2"><p className="font-semibold">{d.title}</p><Badge>{t(`kb.t.${d.doc_type}` as MessageKey)}</Badge></div>
            {d.summary && <p className="mt-1.5 line-clamp-3 text-[15px] text-muted">{d.summary}</p>}
            <p className="mt-2 text-xs text-muted">{t("kb.meta", { n: d.chunk_count, date: shortDate(d.created_at, locale) })}</p>
          </Link></li>))}</ul>
      )}
    </div>
  );
}

/** /app/knowledge/:id: the summary and every passage, so a SafeAssist citation can be checked in context. */
export function KnowledgeDocPage() {
  const { t } = useT();
  const { user } = useAuth();
  const { id } = useParams();
  const { hash } = useLocation();
  const [d, setD] = useState<KnowledgeDocDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [removing, setRemoving] = useState(false);
  useEffect(() => { api.knowledge.get(Number(id)).then(setD).catch(() => setMissing(true)); }, [id]);
  useEffect(() => { if (d && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" }); }, [d, hash]);
  const back = <Link to="/app/knowledge" className="inline-flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden /> {t("kb.all")}</Link>;
  if (missing) return <div className="space-y-4">{back}<Panel><EmptyState icon={<FileText className="h-6 w-6" />} title={t("kb.notFound")} body="" /></Panel></div>;
  if (!d) return <Skeleton className="h-96" />;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {back}
      <Panel className="space-y-2 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-[28px] font-bold leading-tight">{d.title}</h1>
          {user?.role === "admin" && <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}><Trash2 className="h-4 w-4" aria-hidden /> {t("kb.remove")}</Button>}
        </div>
        {d.summary && <p className="rounded-md bg-sunken/60 p-3 text-[15px]"><span className="font-semibold">{t("kb.summary")}: </span>{d.summary}</p>}
      </Panel>
      <Panel className="divide-y divide-line">
        {d.chunks.map((c) => (
          <section key={c.id} id={`c${c.id}`} className={cn("space-y-1 p-5", hash === `#c${c.id}` && "bg-signal/10")}>
            {c.heading && <h2 className="text-lg font-bold">{c.heading}</h2>}
            <p className="whitespace-pre-wrap leading-relaxed">{c.text}</p>
          </section>
        ))}
      </Panel>
      <ConfirmDialog open={removing} title={t("kb.removeTitle")} body={d.title} tone="danger" confirmLabel={t("kb.remove")}
        onCancel={() => setRemoving(false)} onConfirm={async () => { await api.knowledge.remove(d.id).catch(() => {}); window.location.assign("/app/knowledge"); }} />
    </div>
  );
}
