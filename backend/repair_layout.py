from __future__ import annotations

"""Repair a persisted galaxy layout without loading a neural embedding model.

This maintenance command is intentionally lightweight. It derives semantic
vectors from the saved title, abstract and keywords, then rewrites only the
visual fields in papers.json. The neural index can be rebuilt separately.
"""

import hashlib
import json
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_similarity


ROOT = Path(__file__).resolve().parent
PAPERS_JSON = ROOT / "data" / "papers.json"
PALETTE = [
    "#60a5fa", "#f59e0b", "#10b981", "#a78bfa", "#f472b6",
    "#22c55e", "#38bdf8", "#fb7185", "#eab308", "#14b8a6",
]


def _vectors(papers: list[dict]) -> np.ndarray:
    texts: list[str] = []
    identities: list[list[float]] = []
    for paper in papers:
        texts.append(
            "\n".join(
                [
                    str(paper.get("title") or ""),
                    str(paper.get("display_title") or ""),
                    str(paper.get("abstract") or ""),
                    " ".join(str(k) for k in (paper.get("keywords") or [])),
                ]
            )
        )
        digest = hashlib.sha1(str(paper.get("id") or "").encode("utf-8")).digest()
        identities.append([((digest[i] / 255.0) - 0.5) * 0.04 for i in range(12)])

    semantic = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        max_features=1024,
        lowercase=True,
        norm="l2",
    ).fit_transform(texts).toarray().astype(np.float32)
    return np.concatenate([semantic, np.asarray(identities, dtype=np.float32)], axis=1)


def _clusters(vectors: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    n = len(vectors)
    if n == 1:
        return np.zeros(1, dtype=np.int32), vectors.copy()

    best_model = None
    best_labels = None
    best_score = None
    for k in range(2, min(8, n) + 1):
        model = KMeans(n_clusters=k, n_init="auto", random_state=42)
        labels = model.fit_predict(vectors)
        if np.unique(labels).size < 2:
            continue
        try:
            score = float(silhouette_score(vectors, labels, metric="cosine"))
        except Exception:
            continue
        if best_score is None or score > best_score:
            best_model, best_labels, best_score = model, labels, score

    if best_model is None or best_labels is None:
        k = min(5, max(2, int(round(np.sqrt(n)))), n)
        best_model = KMeans(n_clusters=k, n_init="auto", random_state=42)
        best_labels = best_model.fit_predict(vectors)
    return best_labels.astype(np.int32), best_model.cluster_centers_


def _coordinates(vectors: np.ndarray, labels: np.ndarray) -> np.ndarray:
    n = len(vectors)
    if n == 1:
        return np.zeros((1, 3), dtype=np.float32)
    if n == 2:
        return np.asarray([[-3, 0, 0], [3, 0, 0]], dtype=np.float32)
    if n == 3:
        return np.asarray([[0, 3, 0], [-3, -1.5, 0], [3, -1.5, 0]], dtype=np.float32)

    components = min(3, n, vectors.shape[1])
    coords = PCA(n_components=components, random_state=42).fit_transform(vectors)
    if coords.shape[1] < 3:
        coords = np.pad(coords, ((0, 0), (0, 3 - coords.shape[1])))
    coords -= coords.mean(axis=0, keepdims=True)
    max_abs = max(float(np.max(np.abs(coords))), 1e-6)
    coords = (coords / max_abs * 5.5).astype(np.float32)

    cluster_count = int(np.max(labels)) + 1
    if cluster_count > 1:
        for cluster_id in range(cluster_count):
            idx = np.where(labels == cluster_id)[0]
            if idx.size == 0:
                continue
            center = coords[idx].mean(axis=0, keepdims=True)
            coords[idx] = (coords[idx] - center) * 0.6
            angle = 2.0 * np.pi * cluster_id / cluster_count
            coords[idx] += np.asarray(
                [np.cos(angle) * 5.0, 0.0, np.sin(angle) * 5.0],
                dtype=np.float32,
            )
    return coords


def repair() -> dict[str, int]:
    payload = json.loads(PAPERS_JSON.read_text(encoding="utf-8"))
    papers = payload.get("papers") or []
    if not papers:
        return {"papers": 0, "clusters": 0, "unique_positions": 0}

    vectors = _vectors(papers)
    labels, centers = _clusters(vectors)
    coords = _coordinates(vectors, labels)

    for index, paper in enumerate(papers):
        cluster_id = int(labels[index])
        similarity = float(
            cosine_similarity(
                vectors[index].reshape(1, -1),
                centers[cluster_id].reshape(1, -1),
            )[0, 0]
        )
        paper["cluster"] = cluster_id
        paper["field"] = f"Topic {cluster_id + 1}"
        paper["color"] = PALETTE[cluster_id % len(PALETTE)]
        paper["confidence"] = max(0.0, min(1.0, similarity))
        paper["pos"] = [float(value) for value in coords[index]]
        paper["size"] = float(3.0 + paper["confidence"] * 5.0)

    PAPERS_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    unique_positions = len({tuple(round(v, 6) for v in p["pos"]) for p in papers})
    return {
        "papers": len(papers),
        "clusters": len(set(int(v) for v in labels)),
        "unique_positions": unique_positions,
    }


if __name__ == "__main__":
    print(json.dumps(repair(), ensure_ascii=False))
