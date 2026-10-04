import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bot, MessageSquarePlus, Send, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, FormAlert, Panel, Skeleton } from "@/components/ui/misc";
import { ListenButton, MicButton, appendText } from "@/components/voice";
import { useT, type MessageKey } from "@/i18n";
import { api, ApiError } from "@/services/api";
import type { AIConversationSummary, AIMessage } from "@/types/reports";
import { cn } from "@/utils/cn";
import { shortDate } from "@/utils/format";

const MAX_LEN = 1000;
const EXAMPLES: MessageKey[] = ["ai.ex1", "ai.ex2", "ai.ex3", "ai.ex4"];

/** SafeAssist chat. Emergencies and medical concerns are flagged by the server in code, before any AI answer,
 * and shown here as a banner that points to Emergency mode. Every answer is labelled as an AI suggestion. */
export default function AssistantPage() {
  const { t, lang, locale } = useT();
  const [history, setHistory] = useState<AIConversationSummary[] | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const loadHistory = () => api.ai.conversations().then(setHistory).catch(() => setHistory([]));
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end", behavior: "smooth" }); }, [messages, busy]);

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setError("");
  }

  async function openChat(id: number) {
    setLoadingChat(true);
    setError("");
    try {
      const c = await api.ai.conversation(id);
      setConversationId(c.id);
      setMessages(c.messages);
    } catch {
      setError(t("ai.failed"));
    } finally {
      setLoadingChat(false);
    }
  }

  async function remove(id: number) {
    try {
      await api.ai.deleteConversation(id);
      setHistory((h) => h?.filter((c) => c.id !== id) ?? null);
      if (id === conversationId) newChat();
      toast.success(t("ai.deleted"));
    } catch {
      toast.error(t("ai.failed"));
    }
  }

  async function send(message: string) {
    const body = message.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    const mine: AIMessage = { id: -Date.now(), role: "user", content: body, classification: null, demo_mode: false,
      created_at: new Date().toISOString() };
    setMessages((m) => [...m, mine]);
    setText("");
    try {
      const r = await api.ai.assist(body, conversationId, lang);
      setMessages((m) => [...m, r.reply]);
      if (conversationId === null) loadHistory();
      setConversationId(r.conversation_id);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== mine.id));
      setText(body);
      setError(e instanceof ApiError && e.status === 429 ? e.message : t("ai.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-[32px] font-bold"><Bot className="h-8 w-8" aria-hidden />{t("ai.title")}</h1>
            <p className="mt-1 text-muted">{t("ai.subtitle")}</p>
          </div>
          <Button variant="outline" onClick={newChat} disabled={!messages.length}>
            <MessageSquarePlus className="h-4 w-4" aria-hidden /> {t("ai.newChat")}
          </Button>
        </div>

        <Panel className="flex min-h-[420px] flex-col">
          <div className="flex-1 space-y-4 p-4 sm:p-5" aria-live="polite">
            {loadingChat ? <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-24" /></div>
              : messages.length === 0 ? (
                <div>
                  <p className="font-semibold">{t("ai.tryAsking")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {EXAMPLES.map((k) => (
                      <button key={k} type="button" onClick={() => send(t(k))} disabled={busy}
                        className="min-h-[44px] rounded-full border border-line bg-surface px-4 text-left text-[15px] hover:bg-sunken">
                        {t(k)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : messages.map((m) => <Bubble key={m.id} m={m} />)}
            {busy && <p role="status" className="text-sm text-muted">{t("ai.thinking")}</p>}
            <div ref={end} />
          </div>

          <form className="space-y-2 border-t border-line p-4" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            {error && <FormAlert>{error}</FormAlert>}
            <label htmlFor="ai-q" className="sr-only">{t("ai.placeholder")}</label>
            <textarea id="ai-q" rows={2} maxLength={MAX_LEN} value={text} placeholder={t("ai.placeholder")}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
              className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2.5 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-signal" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MicButton onText={(s) => setText((cur) => appendText(cur, s).slice(0, MAX_LEN))} />
              <Button type="submit" loading={busy} disabled={!text.trim()}>
                {!busy && <Send className="h-4 w-4" aria-hidden />} {t("ai.send")}
              </Button>
            </div>
            <p className="text-sm text-muted">{t("ai.privacy")}</p>
          </form>
        </Panel>
      </div>

      <aside>
        <Panel className="overflow-hidden">
          <h2 className="px-4 pt-4 text-base font-bold">{t("ai.history")}</h2>
          {!history ? <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            : history.length === 0 ? <p className="p-4 text-sm text-muted">{t("ai.noHistory")}</p> : (
              <ul className="mt-2 divide-y divide-line border-t border-line">
                {history.map((c) => (
                  <li key={c.id} className={cn("flex items-center gap-1 pr-1", c.id === conversationId && "bg-sunken/60")}>
                    <button type="button" onClick={() => openChat(c.id)} aria-current={c.id === conversationId || undefined}
                      className="min-h-[44px] min-w-0 flex-1 px-4 py-2 text-left hover:bg-sunken/50">
                      <span className="block truncate text-[15px] font-semibold">{c.title}</span>
                      <span className="block text-xs text-muted">{shortDate(c.updated_at, locale)}</span>
                    </button>
                    <Button variant="ghost" size="icon" aria-label={`${t("ai.delete")}: ${c.title}`} onClick={() => remove(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
        </Panel>
      </aside>
    </div>
  );
}

function Bubble({ m }: { m: AIMessage }) {
  const { t } = useT();
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-ink px-4 py-2.5 text-bg">
          <span className="sr-only">{t("ai.you")}: </span>
          <p className="whitespace-pre-wrap">{m.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[92%] space-y-2">
      {m.classification === "emergency" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md bg-danger-solid px-4 py-3 font-semibold text-white">
          <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
          <span className="flex-1">{t("ai.emergencyBanner")}</span>
          <Button asChild size="sm" variant="outline" className="border-white/40 bg-white text-danger hover:bg-white/90">
            <Link to="/app/emergency">{t("ai.openEmergency")}</Link>
          </Button>
        </div>
      )}
      <div className="rounded-lg border border-line bg-surface px-4 py-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Sparkles className="h-4 w-4 text-info" aria-hidden />
          <span>{m.demo_mode ? t("ai.demoMarker") : t("ai.marker")}</span>
          {m.classification === "emergency" && <Badge tone="danger">{t("ai.tagEmergency")}</Badge>}
          {m.classification === "medical_concern" && <Badge tone="caution">{t("ai.tagMedical")}</Badge>}
        </div>
        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
        {m.sources && m.sources.length > 0 && (
          <div className="mt-2 border-t border-line pt-2">
            <p className="text-xs font-semibold text-muted">{t("kb.sources")}</p>
            <ol className="mt-1 space-y-0.5 text-sm">{m.sources.map((s, i) => (
              <li key={s.chunk_id}><Link className="text-info hover:underline" to={`/app/knowledge/${s.document_id}#c${s.chunk_id}`}>
                [{i + 1}] {s.title}{s.heading ? ` › ${s.heading}` : ""}</Link></li>))}</ol>
          </div>
        )}
        <ListenButton text={m.content} className="-ml-2 mt-1" />
      </div>
    </div>
  );
}
