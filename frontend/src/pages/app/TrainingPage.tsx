import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Award, BookOpen, CheckCircle2, Printer, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { useAuth } from "@/hooks/useAuth";
import { useT, type MessageKey } from "@/i18n";
import { catalogLabel } from "@/i18n/labels";
import { api, ApiError } from "@/services/api";
import { LANGUAGES, type Language } from "@/types/auth";
import type { AttemptResult, Certificate, Compliance, CourseCard, CourseDetail, CourseStatus, DraftQuestion } from "@/types/assess";
import { cn } from "@/utils/cn";
import { shortDate } from "@/utils/format";

export const COURSE_TONE: Record<CourseStatus, "safe" | "caution" | "danger" | "info" | "neutral"> = {
  valid: "safe", expiring: "caution", expired: "danger", in_progress: "info", not_started: "neutral",
};

/** Course material is plain text with "## " headings, "- " bullets and "1. " steps; rendered as elements, never HTML. */
function Material({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={blocks.length} className={cn("space-y-1 pl-6", list.ordered ? "list-decimal" : "list-disc")}>
      {list.items.map((x, i) => <li key={i}>{x}</li>)}</Tag>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*] (.*)/);
    const step = line.match(/^\d+\. (.*)/);
    if (bullet || step) {
      const ordered = !!step;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? step)![1]);
      continue;
    }
    flush();
    if (line.startsWith("## ")) blocks.push(<h2 key={blocks.length} className="pt-2 text-xl font-bold">{line.slice(3)}</h2>);
    else if (line) blocks.push(<p key={blocks.length}>{line}</p>);
  }
  flush();
  return <div className="space-y-3 text-[17px] leading-relaxed">{blocks}</div>;
}

function CourseRow({ c }: { c: CourseCard }) {
  const { t, locale } = useT();
  return (
    <li>
      <Link to={`/app/training/${c.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-sunken/50 sm:flex-row sm:items-center sm:gap-4">
        <BookOpen className="hidden h-6 w-6 shrink-0 text-muted sm:block" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{catalogLabel(t, "course", c.title)}</p>
          <p className="text-sm text-muted">{[t(c.mandatory ? "dash.mandatory" : "dash.optional"), t("train.minutes", { n: c.duration_minutes }),
            c.expires_on ? t(c.status === "expired" ? "dash.expiredOn" : "dash.validUntil", { date: shortDate(c.expires_on, locale) }) : null].filter(Boolean).join(" · ")}</p>
          {c.status === "in_progress" && (
            <div className="mt-1.5 h-1.5 max-w-xs overflow-hidden rounded-full bg-sunken" role="img" aria-label={t("dash.pctDone", { pct: c.completion_pct })}>
              <div className="h-full rounded-full bg-info" style={{ width: `${c.completion_pct}%` }} /></div>
          )}
        </div>
        <Badge tone={COURSE_TONE[c.status]}>{t(`training.${c.status}` as MessageKey)}</Badge>
      </Link>
    </li>
  );
}

function ComplianceMatrix() {
  const { t } = useT();
  const [d, setD] = useState<Compliance | null>(null);
  useEffect(() => { api.training.compliance().then(setD).catch(() => {}); }, []);
  if (!d) return <Skeleton className="h-64" />;
  const mark: Record<CourseStatus, string> = { valid: "✓", expiring: "!", expired: "✕", in_progress: "…", not_started: "–" };
  return (
    <Panel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[15px]">
          <caption className="px-5 pt-4 text-left text-lg font-bold">{t("train.matrix")}</caption>
          <thead className="border-y border-line bg-sunken/50 text-sm text-muted">
            <tr><th scope="col" className="px-4 py-2">{t("users.colName")}</th>
              {d.courses.map((c) => <th key={c.id} scope="col" className="px-2 py-2 text-center font-semibold">{catalogLabel(t, "course", c.title)}</th>)}
              <th scope="col" className="px-4 py-2 text-right">%</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.rows.map((r) => (
              <tr key={r.user_id}>
                <th scope="row" className="px-4 py-2 font-semibold"><Link className="hover:underline" to={`/app/people/${r.user_id}`}>{r.full_name}</Link>
                  <span className="block text-xs font-normal text-muted">{r.department}</span></th>
                {d.courses.map((c) => {
                  const s = r.statuses[c.id];
                  return <td key={c.id} className="px-2 py-2 text-center"><span title={t(`training.${s}` as MessageKey)}
                    className={cn("inline-grid h-8 w-8 place-items-center rounded-md font-bold", {
                      valid: "bg-safe/15 text-safe", expiring: "bg-caution/20", expired: "bg-danger/15 text-danger",
                      in_progress: "bg-info/15", not_started: "bg-sunken text-muted" }[s])}>
                    {mark[s]}<span className="sr-only">{t(`training.${s}` as MessageKey)}</span></span></td>;
                })}
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{r.compliance ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-sm text-muted">{t("train.legend")}</p>
    </Panel>
  );
}

function QuizBuilder({ courses }: { courses: CourseCard[] }) {
  const { t, lang } = useT();
  const [courseId, setCourseId] = useState(String(courses[0]?.id ?? ""));
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("5");
  const [language, setLanguage] = useState<Language>(lang);
  const [draft, setDraft] = useState<{ demo_mode: boolean; questions: DraftQuestion[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try { setDraft(await api.training.generate({ course_id: Number(courseId), topic: topic.trim() || null, count: Number(count), language })); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : t("rca.failed")); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!draft) return;
    const course = courses.find((c) => c.id === Number(courseId));
    try {
      await api.training.saveQuiz({ course_id: Number(courseId), title: `${course?.title ?? ""}${topic ? `: ${topic}` : ""}`,
        topic: topic || "General", ai_generated: true, questions: draft.questions });
      toast.success(t("train.quizSaved"));
      setDraft(null);
    } catch (e) { toast.error(e instanceof ApiError ? e.message : t("capa.failed")); }
  }

  return (
    <Panel className="space-y-4 p-5">
      <div><h2 className="text-lg font-bold">{t("train.builder")}</h2><p className="text-sm text-muted">{t("train.builderHint")}</p></div>
      <div className="grid gap-4 sm:grid-cols-4">
        <SelectField label={t("train.course")} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {courses.map((c) => <option key={c.id} value={c.id}>{catalogLabel(t, "course", c.title)}</option>)}
        </SelectField>
        <TextField label={t("train.focus")} hint={t("common.optional")} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} />
        <SelectField label={t("train.count")} value={count} onChange={(e) => setCount(e.target.value)}>
          {[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </SelectField>
        <SelectField label={t("register.language")} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.native}</option>)}
        </SelectField>
      </div>
      <Button variant="outline" loading={busy} onClick={generate}>{!busy && <Sparkles className="h-4 w-4" aria-hidden />} {t("train.generate")}</Button>
      {draft && (
        <div className="space-y-3 rounded-md border border-info/40 bg-info/5 p-4">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-info" aria-hidden /><span className="font-semibold">{t("train.draft")}</span>
            <Badge tone="info">{draft.demo_mode ? t("common.demoAi") : t("common.liveAi")}</Badge></div>
          <ol className="list-decimal space-y-3 pl-5">
            {draft.questions.map((q, i) => (
              <li key={i}><p className="font-semibold">{q.prompt}</p>
                <ul className="mt-1 space-y-0.5">{q.options.map((o, j) => <li key={j} className={j === q.correct_index ? "font-semibold text-safe" : ""}>
                  {j === q.correct_index ? "✓ " : "○ "}{o}</li>)}</ul>
                <p className="text-sm text-muted">{q.explanation}</p></li>
            ))}
          </ol>
          <p className="text-sm font-medium text-muted">{t("train.review")}</p>
          <div className="flex gap-2"><Button size="sm" onClick={save}>{t("train.saveQuiz")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>{t("common.dismiss")}</Button></div>
        </div>
      )}
    </Panel>
  );
}

/** /app/training */
export default function TrainingPage() {
  const { t } = useT();
  const { user } = useAuth();
  const staff = user?.role !== "worker";
  const [params, setParams] = useSearchParams();
  const tab = staff && params.get("tab") === "team" ? "team" : "mine";
  const [courses, setCourses] = useState<CourseCard[] | null>(null);
  useEffect(() => { api.training.courses().then(setCourses).catch(() => setCourses([])); }, []);

  return (
    <div className="space-y-6">
      <div><h1 className="text-[32px] font-bold">{t("train.title")}</h1><p className="mt-1 text-muted">{t("train.subtitle")}</p></div>
      {staff && (
        <div role="tablist" aria-label={t("train.title")} className="inline-flex rounded-md border border-line bg-surface p-1">
          {(["mine", "team"] as const).map((k) => (
            <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setParams(k === "mine" ? {} : { tab: k })}
              className={cn("min-h-[40px] rounded px-4 text-[15px] font-semibold", tab === k ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
              {t(k === "mine" ? "train.tabMine" : "train.tabTeam")}</button>
          ))}
        </div>
      )}
      {tab === "mine" ? (
        <Panel className="overflow-hidden">
          {!courses ? <div className="space-y-2 p-4"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
            : <ul className="divide-y divide-line">{courses.map((c) => <CourseRow key={c.id} c={c} />)}</ul>}
        </Panel>
      ) : (
        <div className="space-y-6"><ComplianceMatrix />{courses && <QuizBuilder courses={courses} />}</div>
      )}
    </div>
  );
}

/** /app/training/:id: read, then take the quiz. Marking happens on the server. */
export function CoursePage() {
  const { t, locale } = useT();
  const { id } = useParams();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.training.course(Number(id)).then((d) => { setC(d); setAnswers(d.quiz ? d.quiz.questions.map(() => null) : []); }).catch(() => {});
  }, [id]);
  if (!c) return <Skeleton className="h-96" />;

  async function markRead() {
    const card = await api.training.read(c!.id).catch(() => null);
    if (card) { setC({ ...c!, ...card }); toast.success(t("train.readDone")); }
  }

  async function submit() {
    if (!c?.quiz) return;
    setBusy(true);
    try {
      const r = await api.training.attempt(c.quiz.id, answers as number[]);
      setResult(r);
      if (r.passed) setC({ ...c, status: "valid", completion_pct: 100, certified_on: r.certified_on, expires_on: r.expires_on, best_score: Math.max(c.best_score ?? 0, r.score) });
      window.scrollTo({ top: document.getElementById("quiz")?.offsetTop ?? 0, behavior: "smooth" });
    } catch (e) { toast.error(e instanceof ApiError ? e.message : t("capa.failed")); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/app/training" className="inline-flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("train.all")}</Link>
      <Panel className="space-y-2 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-[28px] font-bold leading-tight">{catalogLabel(t, "course", c.title)}</h1>
          <Badge tone={COURSE_TONE[c.status]}>{t(`training.${c.status}` as MessageKey)}</Badge>
        </div>
        <p className="text-muted">{[t(c.mandatory ? "dash.mandatory" : "dash.optional"), t("train.minutes", { n: c.duration_minutes }),
          t("train.passMark", { n: c.pass_mark }), c.expires_on ? t("dash.validUntil", { date: shortDate(c.expires_on, locale) }) : null].filter(Boolean).join(" · ")}</p>
        {c.certified_on && <Button asChild variant="outline" size="sm"><Link to={`/app/training/${c.id}/certificate`}><Award className="h-4 w-4" aria-hidden /> {t("train.certificate")}</Link></Button>}
      </Panel>
      <Panel className="space-y-4 p-5" lang="en">
        {c.content ? <Material text={c.content} /> : <p className="text-muted">{c.description}</p>}
        {c.completion_pct < 50 && <Button variant="secondary" onClick={markRead}><CheckCircle2 className="h-4 w-4" aria-hidden /> {t("train.markRead")}</Button>}
      </Panel>
      {c.quiz ? (
        <Panel id="quiz" className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{t("train.quiz")}</h2>
            {c.quiz.ai_generated && <Badge tone="info">{t("train.aiMade")}</Badge>}</div>
          {result && (
            <p role="status" className={cn("rounded-md px-4 py-3 font-semibold", result.passed ? "bg-safe/10 text-safe" : "bg-danger/10 text-danger")}>
              {t(result.passed ? "train.passed" : "train.failed", { score: result.score, mark: result.pass_mark })}</p>
          )}
          <ol className="space-y-5">
            {c.quiz.questions.map((q, i) => {
              const r = result?.results[i];
              return (
                <li key={q.id}>
                  <fieldset>
                    <legend className="font-semibold">{i + 1}. {q.prompt}</legend>
                    <div className="mt-2 space-y-1.5">
                      {q.options.map((o, j) => (
                        <label key={j} className={cn("flex min-h-[48px] cursor-pointer items-center gap-3 rounded-md border px-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal",
                          r ? (j === r.correct_index ? "border-safe bg-safe/10" : j === r.answer ? "border-danger bg-danger/10" : "border-line")
                            : answers[i] === j ? "border-ink bg-sunken" : "border-line bg-surface hover:bg-sunken")}>
                          <input type="radio" name={`q${q.id}`} checked={answers[i] === j} disabled={!!result}
                            onChange={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))} className="h-5 w-5" />
                          <span className="flex-1">{o}</span>
                          {r && j === r.correct_index && <CheckCircle2 className="h-5 w-5 text-safe" aria-label={t("train.correct")} />}
                          {r && j === r.answer && !r.correct && <XCircle className="h-5 w-5 text-danger" aria-label={t("train.yourAnswer")} />}
                        </label>
                      ))}
                    </div>
                    {r?.explanation && <p className="mt-1.5 text-sm text-muted">{r.explanation}</p>}
                  </fieldset>
                </li>
              );
            })}
          </ol>
          {result ? <Button variant="outline" onClick={() => { setResult(null); setAnswers(c.quiz!.questions.map(() => null)); }}>{t("train.tryAgain")}</Button>
            : <Button loading={busy} disabled={answers.some((a) => a === null)} onClick={submit}>{t("train.submit")}</Button>}
        </Panel>
      ) : <Panel><EmptyState icon={<BookOpen className="h-6 w-6" />} title={t("train.noQuiz")} body="" /></Panel>}
    </div>
  );
}

/** /app/training/:id/certificate: print or save as PDF from the browser. */
export function CertificatePage() {
  const { t, locale } = useT();
  const { id } = useParams();
  const [c, setC] = useState<Certificate | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { api.training.certificate(Number(id)).then(setC).catch(() => setMissing(true)); }, [id]);
  if (missing) return <Panel><EmptyState icon={<Award className="h-6 w-6" />} title={t("train.noCert")} body="" /></Panel>;
  if (!c) return <Skeleton className="h-96" />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex justify-between print:hidden">
        <Link to={`/app/training/${id}`} className="inline-flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t("common.back")}</Link>
        <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> {t("train.print")}</Button>
      </div>
      <section className="rounded-lg border-4 border-double border-ink bg-surface p-10 text-center print:border-black">
        <Award className="mx-auto h-14 w-14 text-signal" aria-hidden />
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.2em] text-muted">{t("train.certTitle")}</p>
        <p className="mt-6 text-muted">{t("train.certifies")}</p>
        <p className="mt-2 font-display text-4xl font-bold">{c.name}</p>
        <p className="text-muted">{c.employee_id}</p>
        <p className="mt-6 text-muted">{t("train.completed")}</p>
        <p className="mt-2 font-display text-2xl font-bold">{catalogLabel(t, "course", c.course)}</p>
        {c.score !== null && <p className="mt-2">{t("train.scoreOf", { n: c.score })}</p>}
        <div className="mt-8 grid grid-cols-2 gap-4 text-left text-[15px] sm:grid-cols-3">
          <div><p className="text-muted">{t("train.issued")}</p><p className="font-semibold">{shortDate(c.certified_on, locale)}</p></div>
          <div><p className="text-muted">{t("train.expires")}</p><p className="font-semibold">{c.expires_on ? shortDate(c.expires_on, locale) : "—"}</p></div>
          <div><p className="text-muted">{t("train.number")}</p><p className="font-mono font-semibold">{c.number}</p></div>
        </div>
        {!c.valid && <p className="mt-6 font-bold text-danger">{t("train.expiredCert")}</p>}
      </section>
    </div>
  );
}
