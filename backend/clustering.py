from __future__ import annotations

import hashlib
import os
import sys

import numpy as np
from sklearn.decomposition import PCA
from scipy.spatial import cKDTree


def cluster_palette() -> list[str]:
    return [
        "#60a5fa",
        "#f59e0b",
        "#10b981",
        "#a78bfa",
        "#f472b6",
        "#22c55e",
        "#38bdf8",
        "#fb7185",
        "#eab308",
        "#14b8a6",
    ]


def fallback_pos(paper_id: str) -> list[float]:
    h = hashlib.sha1((paper_id or "").encode("utf-8")).digest()
    a = int.from_bytes(h[0:4], "little", signed=False) / 2**32
    b = int.from_bytes(h[4:8], "little", signed=False) / 2**32
    c = int.from_bytes(h[8:12], "little", signed=False) / 2**32
    x = (a - 0.5) * 14.0
    y = (b - 0.5) * 14.0
    z = (c - 0.5) * 14.0
    return [float(x), float(y), float(z)]


def separate_overlapping_nodes(
    coords: np.ndarray, paper_ids: list[str], min_distance: float = 0.9
) -> np.ndarray:
    """Keep semantic positions, but separate coincident or intersecting planets."""
    result = np.asarray(coords, dtype=np.float64).copy()
    if len(result) <= 1:
        return result.astype(np.float32)
    for index, pid in enumerate(paper_ids):
        if not np.all(np.isfinite(result[index])):
            result[index] = fallback_pos(pid)
    # A tiny deterministic displacement gives identical embeddings a direction.
    jitter = np.asarray([fallback_pos(pid) for pid in paper_ids]) * 0.002
    result += jitter
    center = result.mean(axis=0)
    for _ in range(160):
        pairs = sorted(cKDTree(result).query_pairs(min_distance))
        if not pairs:
            break
        for left, right in pairs:
            delta = result[right] - result[left]
            distance = float(np.linalg.norm(delta))
            if distance >= min_distance:
                continue
            if distance < 1e-9:
                delta = np.asarray(fallback_pos(f"{paper_ids[left]}:{paper_ids[right]}"))
                distance = float(np.linalg.norm(delta))
                if distance < 1e-9:
                    delta, distance = np.array([1.0, 0.0, 0.0]), 1.0
                direction = delta / distance
                distance = 0.0
            else:
                direction = delta / distance
            shift = direction * ((min_distance - distance) * 0.5 + 1e-5)
            result[left] -= shift
            result[right] += shift
    result += center - result.mean(axis=0)
    return result.astype(np.float32)


def reduce_to_3d(vectors: np.ndarray, *, use_umap: bool = True) -> np.ndarray:
    n = vectors.shape[0]
    if n == 1:
        return np.zeros((1, 3), dtype=np.float32)

    if n == 2:
        return np.array(
            [[-2.5, 0.0, 0.0], [2.5, 0.0, 0.0]], dtype=np.float32
        )

    if n == 3:
        return np.array(
            [[0.0, 2.5, 0.0], [-2.5, -1.25, 0.0], [2.5, -1.25, 0.0]],
            dtype=np.float32,
        )

    coords: np.ndarray | None = None
    # umap-learn/numba currently has compatibility problems on Python 3.13 and
    # can stall during module import. Import it lazily only on supported Python
    # versions; PCA remains the deterministic fallback everywhere else.
    allow_umap = (
        use_umap
        and sys.version_info < (3, 13)
        and (os.getenv("SCHOLAR_USE_UMAP") or "1").strip().lower()
        not in {"0", "false", "no"}
    )
    if allow_umap:
        try:
            import umap

            reducer = umap.UMAP(
                n_components=3,
                n_neighbors=min(10, max(2, n - 1)),
                min_dist=0.12,
                init="random" if n < 10 else "spectral",
                random_state=42,
            )
            coords = reducer.fit_transform(vectors)
        except Exception:
            coords = None

    if coords is None:
        n_components = min(3, n, vectors.shape[1])
        pca = PCA(n_components=n_components, random_state=42)
        coords = pca.fit_transform(vectors)
        if coords.shape[1] < 3:
            coords = np.pad(coords, ((0, 0), (0, 3 - coords.shape[1])), constant_values=0.0)

    coords = coords - coords.mean(axis=0, keepdims=True)
    max_abs = float(np.max(np.abs(coords))) if coords.size else 1.0
    if max_abs < 1e-6:
        max_abs = 1.0
    coords = (coords / max_abs * 5.5).astype(np.float32)

    return coords
