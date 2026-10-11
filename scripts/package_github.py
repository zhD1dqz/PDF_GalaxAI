"""Build and validate a clean source ZIP for GitHub, without local user data."""
from __future__ import annotations

import ast
import json
import os
import re
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = (
    ".gitignore", "README.md", "README.zh-CN.md", "GRAPHICS_RESEARCH.md",
    "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts",
    "tailwind.config.cjs", "postcss.config.cjs", "index.html", "index.css",
    "index.tsx", "PDF_GalaxAI.cmd", "GRAPHICS_DEMO.cmd", "test_upload_pdf.py",
)
SOURCE_DIRS = ("frontend", "backend", "tests", "scripts", "docs")
EXCLUDED_DIRS = {
    "node_modules", "data", "models", "__pycache__", ".venv", "venv",
    ".cache", ".pytest_cache", ".git", "dist", "release", ".chrome-profile",
}
TEXT_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".md", ".json", ".cmd", ".html", ".css", ".txt", ".example"}
SECRET_NAME = re.compile(r"(?:API_KEY|API_SECRET|APP_ID|PASSWORD|ACCESS_TOKEN|SECRET_KEY)$", re.I)


def source_files() -> list[Path]:
    files = [ROOT / name for name in ROOT_FILES]
    for name in SOURCE_DIRS:
        for current, directories, filenames in os.walk(ROOT / name):
            directories[:] = sorted(d for d in directories if d not in EXCLUDED_DIRS)
            for filename in sorted(filenames):
                path = Path(current) / filename
                if path.is_symlink() or path.suffix.lower() not in TEXT_SUFFIXES:
                    continue
                if filename.startswith(".env") and filename != ".env.example":
                    continue
                if name == "tests" and path.suffix != ".py":
                    continue
                files.append(path)
    result = sorted(set(files))
    for path in result:
        if not path.is_file():
            raise RuntimeError(f"Required source file missing: {path.relative_to(ROOT)}")
    return result


def check_credentials(path: Path) -> None:
    text = path.read_text(encoding="utf-8-sig")
    if path.suffix == ".py":
        for node in ast.walk(ast.parse(text, filename=str(path))):
            if not isinstance(node, ast.Call) or len(node.args) < 2:
                continue
            if not isinstance(node.func, ast.Attribute) or node.func.attr != "getenv":
                continue
            key, default = node.args[:2]
            if (isinstance(key, ast.Constant) and isinstance(key.value, str)
                    and SECRET_NAME.search(key.value)
                    and isinstance(default, ast.Constant) and default.value):
                raise RuntimeError(f"Nonempty credential default: {path.relative_to(ROOT)}:{node.lineno}")
    if path.name == ".env.example":
        for index, line in enumerate(text.splitlines(), 1):
            if line.strip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if SECRET_NAME.search(key.strip()) and value.strip().strip("\"'"):
                raise RuntimeError(f"Credential in public template: {path.relative_to(ROOT)}:{index}")
    if re.search(r"sk-[A-Za-z0-9_-]{24,}", text):
        raise RuntimeError(f"Possible API credential: {path.relative_to(ROOT)}")


def package() -> dict:
    files = source_files()
    for path in files:
        check_credentials(path)
        if path.stat().st_size >= 25 * 1024 * 1024:
            raise RuntimeError(f"Unexpected large source file: {path.relative_to(ROOT)}")
    output = ROOT / "release"
    output.mkdir(exist_ok=True)
    archive = output / "PDF_GalaxAI-github.zip"
    if archive.exists():
        archive = output / ("PDF_GalaxAI-github-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f") + ".zip")
    with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=9) as zipped:
        for path in files:
            zipped.write(path, "PDF_GalaxAI/" + path.relative_to(ROOT).as_posix())
    with ZipFile(archive) as zipped:
        bad = zipped.testzip()
        if bad:
            raise RuntimeError(f"Archive checksum failed: {bad}")
        names = zipped.namelist()
        for name in names:
            parts = Path(name).parts
            if any(part in EXCLUDED_DIRS for part in parts):
                raise RuntimeError(f"Excluded directory in archive: {name}")
            if Path(name).name.startswith(".env") and Path(name).name != ".env.example":
                raise RuntimeError(f"Local configuration in archive: {name}")
        assert "PDF_GalaxAI/backend/.env.example" in names
        assert "PDF_GalaxAI/backend/requirements.txt" in names
        assert len(names) == len(files)
    return {"archive": str(archive), "files": len(files), "bytes": archive.stat().st_size,
            "source_only": True, "credential_checks_passed": True}


if __name__ == "__main__":
    print(json.dumps(package(), ensure_ascii=False, indent=2))
