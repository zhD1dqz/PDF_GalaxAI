"""Regression checks for local PDF import and galaxy layout recovery."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from scipy.spatial.distance import pdist

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import config
import store as store_module
from clustering import separate_overlapping_nodes
from store import ScholarStore


class LayoutRecoveryTests(unittest.TestCase):
    def test_requested_topics_are_semantic_and_visually_separated(self):
        vectors = np.repeat(np.eye(4, dtype=np.float32), 6, axis=0)
        with patch.dict(os.environ, {"SCHOLAR_CLUSTER_COUNT": "4"}), \
             patch.object(ScholarStore, "_load_db"), \
             patch.object(ScholarStore, "_save_db"), \
             patch.object(ScholarStore, "_get_paper_vectors_locked", return_value=vectors):
            library = ScholarStore()
            library._papers = [{"id": str(i)} for i in range(24)]
            library._recompute_locked()
            self.assertEqual(len({p["cluster"] for p in library._papers}), 4)
            self.assertEqual(len({p["color"] for p in library._papers}), 4)
            for start in range(0, 24, 6):
                self.assertEqual(len({p["cluster"] for p in library._papers[start:start + 6]}), 1)
            centers = [
                np.mean([p["pos"] for p in library._papers if p["cluster"] == cid], axis=0)
                for cid in range(4)
            ]
            self.assertGreater(float(pdist(np.asarray(centers)[:, :2]).min()), 4.0)

    def test_requested_topics_clamp_to_available_papers(self):
        with patch.dict(os.environ, {"SCHOLAR_CLUSTER_COUNT": "4"}), \
             patch.object(ScholarStore, "_load_db"), \
             patch.object(ScholarStore, "_save_db"), \
             patch.object(ScholarStore, "_get_paper_vectors_locked", return_value=np.eye(2)):
            library = ScholarStore()
            library._papers = [{"id": "a"}, {"id": "b"}]
            library._recompute_locked()
            self.assertEqual(len({p["cluster"] for p in library._papers}), 2)

    def test_local_model_path_does_not_depend_on_launch_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            backend_root = Path(temporary) / "backend"
            model_dir = backend_root / "models" / "all-MiniLM-L6-v2"
            model_dir.mkdir(parents=True)
            with patch.object(config, "ROOT", backend_root):
                for configured in ("models/all-MiniLM-L6-v2", "backend/models/all-MiniLM-L6-v2"):
                    self.assertEqual(config.resolve_embedding_model(configured), str(model_dir.resolve()))
        self.assertEqual(config.resolve_embedding_model("BAAI/bge-m3"), "BAAI/bge-m3")

    def test_identical_embeddings_do_not_leave_planets_overlapping(self):
        ids = [f"paper-{i}" for i in range(24)]
        coords = separate_overlapping_nodes(np.zeros((24, 3)), ids)
        self.assertTrue(np.all(np.isfinite(coords)))
        self.assertGreater(float(pdist(coords).min()), 0.899)
        np.testing.assert_array_equal(coords, separate_overlapping_nodes(np.zeros((24, 3)), ids))

    def test_named_pdf_import_restores_ids_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            files = root / "files"
            files.mkdir()
            db = root / "papers.json"
            raw = b"first local test pdf"
            (files / "Restored.pdf").write_bytes(raw)
            (files / "New.PDF").write_bytes(b"new local test pdf")
            (files / "Duplicate.pdf").write_bytes(b"new local test pdf")
            db.write_text(json.dumps({"papers": [{"id": "old-id", "filename": "Restored.pdf"}]}))
            with patch.object(store_module, "FILES_DIR", files), \
                 patch.object(store_module, "PAPERS_JSON", db), \
                 patch.object(store_module, "read_pdf_text", return_value="Test abstract document. " * 20), \
                 patch.object(ScholarStore, "_index_paper"), \
                 patch.object(ScholarStore, "_register_corpus"), \
                 patch.object(ScholarStore, "_auto_keywords", return_value=["document"]), \
                 patch.object(ScholarStore, "_recompute_locked", autospec=True) as recompute:
                library = ScholarStore()
                first = library.ingest_from_files()
                second = library.ingest_from_files()
                self.assertEqual(first, {"added": 1, "restored": 1, "failed": 0})
                self.assertEqual(second, {"added": 0, "restored": 0, "failed": 0})
                self.assertEqual(len(library._papers), 2)
                self.assertEqual((files / "old-id.pdf").read_bytes(), raw)
                self.assertTrue((files / "Restored.pdf").exists())
                self.assertEqual(recompute.call_count, 1)

    def test_vector_store_failure_still_recovers_semantic_layout(self):
        with patch.object(ScholarStore, "_load_db"), \
             patch.object(ScholarStore, "_save_db"), \
             patch.object(ScholarStore, "_get_paper_vectors_locked", side_effect=RuntimeError("broken index")):
            library = ScholarStore()
            library._papers = [
                {"id": str(i), "title": title, "pos": [0, 0, 0], "field": "Processing..."}
                for i, title in enumerate([
                    "Neural radiance field rendering", "Gaussian splatting rendering",
                    "Document OCR understanding", "Text document layout recognition",
                    "Multimodal image language learning", "Vision language understanding",
                ])
            ]
            library._recompute_locked()
            positions = np.asarray([p["pos"] for p in library._papers])
            self.assertGreater(float(pdist(positions).min()), 0.899)
            self.assertFalse(library._layout_needs_recompute_locked())
            self.assertGreater(len({p["cluster"] for p in library._papers}), 1)


if __name__ == "__main__":
    unittest.main()
