"""Check the restored library through the same proxy used by the browser."""
import hashlib
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
from scipy.spatial.distance import pdist

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from config import FILES_DIR
from vector_store import VectorStore


BASE = "http://127.0.0.1:3000"


def request(path, method="GET"):
    with urlopen(Request(BASE + path, method=method), timeout=30) as response:
        return response.read()


def verify():
    assert b"<html" in request("/").lower(), "Frontend did not serve the application"
    graph = json.loads(request("/api/papers"))
    papers = graph["papers"]
    assert len(papers) == 24, f"Expected the 24 test PDFs, got {len(papers)}"
    positions = np.asarray([p["pos"] for p in papers])
    assert np.all(np.isfinite(positions)), "Non-finite coordinates"
    minimum_distance = float(pdist(positions).min())
    assert minimum_distance >= 0.899, f"Overlapping planets: {minimum_distance}"
    assert graph["edges"], "Missing semantic links"
    assert len({p["cluster"] for p in papers}) == 4, "Expected four semantic nebulae"
    assert len({p["color"] for p in papers}) == 4, "Expected four nebula colors"
    for paper in papers:
        pdf = request(f"/files/{paper['id']}.pdf")
        assert pdf.startswith(b"%PDF"), f"Unreadable PDF: {paper['filename']}"
        source = FILES_DIR / paper["filename"]
        assert source.is_file(), f"Missing original source: {paper['filename']}"
        assert hashlib.sha256(pdf).digest() == hashlib.sha256(source.read_bytes()).digest()
    status = json.loads(request("/api/admin/index-status"))
    assert not status["needs_reindex"], "Embedding model mismatch"
    scan = json.loads(request("/api/scan", "POST"))
    assert scan["added"] == 0 and scan["failed"] == 0 and scan["total"] == len(papers)
    vectors = VectorStore()
    indexed = sum(vectors.has_paper(p["id"]) and vectors.has_chunks(p["id"]) for p in papers)
    assert indexed == len(papers), "Missing paper or full-text vectors"
    print(json.dumps({
        "papers": len(papers), "unique_positions": len({tuple(p) for p in positions}),
        "minimum_distance": round(minimum_distance, 4),
        "clusters": len({p["cluster"] for p in papers}), "edges": len(graph["edges"]),
        "pdfs_verified": len(papers), "fully_indexed": indexed,
        "repeat_scan_added": scan["added"], "url": BASE,
    }, indent=2))


if __name__ == "__main__":
    verify()
