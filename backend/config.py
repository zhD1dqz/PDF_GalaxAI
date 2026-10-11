from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _load_local_env_file() -> None:
    """
    轻量读取 backend/.env（不依赖 python-dotenv）。
    规则：
    - 支持 KEY=VALUE
    - 跳过空行与 # 注释
    - 仅在当前进程里该变量不存在时才写入（不覆盖系统环境变量）
    - 支持去掉首尾引号 "..." / '...'
    """
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    try:
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            if not key:
                continue
            if (val.startswith('"') and val.endswith('"')) or (
                val.startswith("'") and val.endswith("'")
            ):
                val = val[1:-1]
            os.environ.setdefault(key, val)
    except Exception as e:
        print(f"[config] Warning: failed to load .env: {e}")


_load_local_env_file()


def resolve_embedding_model(model_name: str) -> str:
    """Resolve local checkpoints independently of the launcher's working directory."""
    model_path = Path(model_name).expanduser()
    if model_path.is_absolute():
        return str(model_path.resolve())
    # Accept models/foo relative to backend and backend/models/foo relative to
    # the project, while leaving Hugging Face repo IDs untouched.
    for base in (ROOT, ROOT.parent):
        candidate = base / model_path
        if candidate.is_dir():
            return str(candidate.resolve())
    return model_name

DATA_DIR = Path(os.getenv("SCHOLAR_DATA_DIR") or (ROOT / "data")).resolve()
FILES_DIR = DATA_DIR / "files"
PAPERS_JSON = DATA_DIR / "papers.json"
INBOX_DIR = Path(os.getenv("SCHOLAR_INBOX_DIR") or (DATA_DIR / "inbox")).resolve()

CHROMA_DIR = DATA_DIR / "chroma"
CUSTOM_MODELS_JSON = DATA_DIR / "custom_models.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)
FILES_DIR.mkdir(parents=True, exist_ok=True)
INBOX_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

# --- 讯飞星火 WebSocket 配置 (X1.5 深度推理) ---
# Credentials come from the ignored local environment file or process environment.
SPARK_APP_ID = os.getenv("SPARK_APP_ID", "")
SPARK_API_SECRET = os.getenv("SPARK_API_SECRET", "")
SPARK_API_KEY = os.getenv("SPARK_API_KEY", "")

# 接口地址 (WebSocket)
SPARK_WS_URL = "wss://spark-api.xf-yun.com/v1/x1"

# 模型 Domain (必须是 spark-x)
SPARK_DOMAIN = "spark-x"
