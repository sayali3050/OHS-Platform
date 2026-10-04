"""Company knowledge base: SOPs and manuals that SafeAssist answers from, with citations.

Pipeline: extract text (PDF, Markdown or plain text) -> split into passages under their section heading ->
index. Retrieval is BM25 keyword scoring, which works offline in Demo AI Mode; when live AI is on, passages also
get embeddings and the score blends both (hybrid search). Vectors are stored with the passage in the database, so
no separate vector service is needed at this scale (a few hundred documents).
"""
import io
import math
import re
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import KnowledgeChunk, KnowledgeDocument

CHUNK_CHARS = 900
MIN_SCORE = 1.2  # below this BM25 score a passage isn't a real match
MIN_COVERAGE = 0.5  # ...and it must contain at least half of the question's words (two or more)
_TOKEN = re.compile(r"[ऀ-ॣ०-ॿA-Za-zäöüß0-9]+")
_STOP = {"the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for", "is", "are", "be", "it", "this", "that",
         "with", "as", "by", "do", "i", "you", "we", "my", "how", "what", "when", "where", "should", "can", "if", "from",
         "der", "die", "das", "und", "ist", "ich", "wie", "was", "है", "और", "में", "का", "की", "के", "आहे", "आणि", "मध्ये"}


class DocumentRejected(ValueError):
    pass


def tokens(text: str) -> list[str]:
    return [w for w in (m.group().lower() for m in _TOKEN.finditer(text)) if w not in _STOP and len(w) > 1]


def extract_text(raw: bytes, filename: str) -> tuple[str, str]:
    """(text, content type). The file's own bytes decide the type, not its name."""
    if raw.startswith(b"%PDF-"):
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(raw))
            pages = [p.extract_text() or "" for p in reader.pages[:200]]
        except Exception:
            raise DocumentRejected("This PDF couldn't be read. It may be damaged or password-protected.")
        text = "\n\n".join(pages)
        if len(text.strip()) < 50:
            raise DocumentRejected("No text found in this PDF. Scanned pages need OCR first.")
        return text, "application/pdf"
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise DocumentRejected("Upload a PDF, Markdown or plain-text file.")
    if "\x00" in text:
        raise DocumentRejected("Upload a PDF, Markdown or plain-text file.")
    return text, "text/markdown" if filename.lower().endswith(".md") else "text/plain"


def _is_heading(line: str) -> str | None:
    s = line.strip()
    if s.startswith("#"):
        return s.lstrip("#").strip() or None
    if re.match(r"^\d+(\.\d+)*\.?\s+\S", s) and len(s) < 80 and not s.endswith("."):
        return s
    if 3 < len(s) < 60 and s.isupper():
        return s.title()
    return None


def split(text: str) -> list[tuple[str | None, str]]:
    """Passages of about CHUNK_CHARS characters, each tagged with the section heading it sits under."""
    out: list[tuple[str | None, str]] = []
    heading, buf = None, ""

    def flush():
        nonlocal buf
        if buf.strip():
            out.append((heading, buf.strip()))
        buf = ""

    for para in re.split(r"\n\s*\n", text.replace("\r\n", "\n")):
        lines = para.strip().split("\n")
        h = _is_heading(lines[0]) if lines and lines[0] else None
        if h:
            flush()
            heading = h[:200]
            lines = lines[1:]
        body = "\n".join(lines).strip()
        if not body:
            continue
        if len(buf) + len(body) > CHUNK_CHARS:
            flush()
        while len(body) > CHUNK_CHARS * 1.5:  # a very long paragraph: cut at a sentence end
            cut = body.rfind(". ", 0, CHUNK_CHARS) + 1 or CHUNK_CHARS
            out.append((heading, body[:cut].strip()))
            body = body[cut:].strip()
        buf += ("\n\n" if buf else "") + body
    flush()
    return out[:2000]


def lead_summary(text: str, sentences: int = 3) -> str:
    """Demo AI Mode summary: the document's first few real sentences (an honest, extractive summary)."""
    body = " ".join(line for line in text.splitlines() if line.strip() and not _is_heading(line))
    parts = re.split(r"(?<=[.!?।])\s+", body)
    return " ".join(p for p in parts[:sentences] if p)[:600]


# --- search -------------------------------------------------------------------------------------------------------

@dataclass
class Hit:
    chunk: KnowledgeChunk
    document: KnowledgeDocument
    score: float


def _bm25(query: list[str], docs: list[list[str]], k1: float = 1.5, b: float = 0.75) -> list[float]:
    n = len(docs)
    if not n or not query:
        return [0.0] * n
    avg = sum(map(len, docs)) / n or 1
    df = Counter(t for d in docs for t in set(d))
    scores = []
    for d in docs:
        tf = Counter(d)
        s = 0.0
        for q in set(query):
            if q not in tf:
                continue
            idf = math.log(1 + (n - df[q] + 0.5) / (df[q] + 0.5))
            s += idf * tf[q] * (k1 + 1) / (tf[q] + k1 * (1 - b + b * len(d) / avg))
        scores.append(s)
    return scores


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def search(db: Session, query: str, limit: int = 5, embed=None) -> list[Hit]:
    """Top passages for `query`. `embed` (live AI only) turns text into a vector for the hybrid score."""
    rows = db.execute(select(KnowledgeChunk, KnowledgeDocument).join(KnowledgeDocument)).all()
    if not rows:
        return []
    q = tokens(query)
    texts = [tokens(f"{c.heading or ''} {d.title} {c.text}") for c, d in rows]
    bm = _bm25(q, texts)
    top_bm = max(bm) or 1.0
    qv = None
    if embed is not None and any(c.embedding for c, _ in rows):
        try:
            qv = embed([query])[0]
        except Exception:
            qv = None
    hits = []
    wanted = set(q)
    for (c, d), s, words in zip(rows, bm, texts):
        matched = len(wanted & set(words))
        if wanted and (matched < min(2, len(wanted)) or matched / len(wanted) < MIN_COVERAGE):
            continue  # one shared word ("lift" in "forklift") isn't an answer
        score = s
        if qv is not None and c.embedding:
            score = 0.5 * (s / top_bm) * 4 + 0.5 * max(0.0, _cosine(qv, c.embedding)) * 4  # both scaled to ~0..4
        if score >= MIN_SCORE:
            hits.append(Hit(c, d, score))
    return sorted(hits, key=lambda h: -h.score)[:limit]


def citation(h: Hit) -> dict:
    return {"document_id": h.document.id, "title": h.document.title, "heading": h.chunk.heading, "chunk_id": h.chunk.id,
            "snippet": h.chunk.text[:280], "score": round(h.score, 2)}
