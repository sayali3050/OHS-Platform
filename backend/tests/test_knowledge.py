"""Phase 8: knowledge base upload, chunking, search, and SafeAssist answers that cite company documents."""
import io

from app.services.knowledge_base import DocumentRejected, extract_text, lead_summary, split
from tests.conftest import token_for


def test_split_keeps_headings_and_size():
    text = "# Title\n\n## 1. Scope\nApplies to drivers.\n\n## 2. Rules\n" + ("Keep to the speed limit. " * 80)
    parts = split(text)
    assert parts[0] == ("1. Scope", "Applies to drivers.")
    assert all(h == "2. Rules" for h, _ in parts[1:]) and all(len(b) <= 1400 for _, b in parts)


def test_extract_rejects_binary_and_reads_text():
    assert extract_text("Hello ünïcode".encode(), "a.md") == ("Hello ünïcode", "text/markdown")
    import pytest
    with pytest.raises(DocumentRejected):
        extract_text(b"\x89PNG\r\n\x1a\n\x00\x00binary", "photo.txt")
    with pytest.raises(DocumentRejected):
        extract_text(b"%PDF-1.4 not really a pdf", "x.pdf")


def test_lead_summary_is_extractive():
    assert lead_summary("# Head\nFirst sentence here. Second one! Third? Fourth.", 2) == "First sentence here. Second one!"


def test_seeded_documents_are_listed_and_searchable(client, worker_h):
    docs = client.get("/api/knowledge", headers=worker_h).json()
    assert {d["title"] for d in docs} >= {"Forklift Operation SOP (demo)", "Chemical Spill Response SOP (demo)"}
    assert all(d["summary"] and d["chunk_count"] > 0 for d in docs)
    hits = client.get("/api/knowledge/search?q=forklift speed limit warehouse", headers=worker_h).json()
    assert hits[0]["title"] == "Forklift Operation SOP (demo)" and hits[0]["heading"] == "3. Driving rules"
    detail = client.get(f"/api/knowledge/{hits[0]['document_id']}", headers=worker_h).json()
    assert any("8 km/h" in c["text"] for c in detail["chunks"])


def test_safeassist_cites_company_documents(client):
    h = token_for(client, "worker16@demo.com")
    r = client.post("/api/ai/assist", json={"message": "What is the forklift speed limit in the warehouse?", "language": "en"},
                    headers=h).json()["reply"]
    assert r["sources"] and r["sources"][0]["title"] == "Forklift Operation SOP (demo)"
    assert "8 km/h" in r["content"] and "[1]" in r["content"]
    # No company document on this: the answer says so, then gives general guidance.
    other = client.post("/api/ai/assist", json={"message": "How should I sit at a computer desk?", "language": "en"}, headers=h).json()["reply"]
    assert not other["sources"] and other["content"].startswith("No company document covers this")


def test_only_admins_upload_and_files_are_checked(client, admin_h, supervisor_h):
    files = {"file": ("ladder.md", io.BytesIO(b"# Ladder Safety\n\n## Use\nFace the ladder and keep three points of contact."), "text/markdown")}
    assert client.post("/api/knowledge", data={"title": "Ladder Safety"}, files=files, headers=supervisor_h).status_code == 403
    files = {"file": ("ladder.md", io.BytesIO(b"# Ladder Safety\n\n## Use\nFace the ladder and keep three points of contact."), "text/markdown")}
    r = client.post("/api/knowledge", data={"title": "Ladder Safety", "doc_type": "sop"}, files=files, headers=admin_h)
    assert r.status_code == 201 and r.json()["chunk_count"] == 1
    bad = client.post("/api/knowledge", data={"title": "Image"}, files={"file": ("x.png", io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00"), "image/png")},
                      headers=admin_h)
    assert bad.status_code == 422 and "file" in bad.json()["fields"]
    assert client.delete(f"/api/knowledge/{r.json()['id']}", headers=admin_h).status_code == 204
