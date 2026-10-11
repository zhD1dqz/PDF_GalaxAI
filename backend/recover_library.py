"""Recover the local PDF library. Run with the backend stopped.

python backend/recover_library.py --archive-missing
"""
from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime

from config import DATA_DIR, FILES_DIR, PAPERS_JSON
from store import ScholarStore


def recover(archive_missing: bool = False) -> dict:
    backup = DATA_DIR / "backups" / ("library-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
    backup.mkdir(parents=True, exist_ok=False)
    if PAPERS_JSON.exists():
        shutil.copy2(PAPERS_JSON, backup / "papers.json")
    library = ScholarStore()
    imported = library.ingest_from_files()
    inbox_added = library.ingest_from_inbox()
    archived = 0
    if archive_missing:
        with library._lock:
            missing = [p for p in library._papers if not (FILES_DIR / f"{p['id']}.pdf").is_file()]
            if missing:
                (backup / "unavailable-papers.json").write_text(
                    json.dumps({"papers": missing}, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                missing_ids = {p["id"] for p in missing}
                library._papers = [p for p in library._papers if p["id"] not in missing_ids]
                archived = len(missing)
                library._vectors = None
                library._save_db()
    library.ensure_all_indexed()
    with library._lock:
        library._recompute_locked()
        if library._model is not None and library._model_load_error is None:
            library._last_emb_model = library._model_name
            library._save_db()
    papers = library.list_pdfs()
    return {
        **imported, "inbox_added": inbox_added, "archived_missing": archived,
        "papers": len(papers),
        "unique_positions": len({tuple(round(v, 5) for v in p["pos"]) for p in papers}),
        "clusters": len({p["cluster"] for p in papers}),
        "pdfs_available": sum((FILES_DIR / f"{p['id']}.pdf").is_file() for p in papers),
        "model": library._model_name, "backup": str(backup),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive-missing", action="store_true",
                        help="Preserve metadata without a local PDF in the recovery backup")
    args = parser.parse_args()
    print(json.dumps(recover(args.archive_missing), ensure_ascii=False, indent=2))
