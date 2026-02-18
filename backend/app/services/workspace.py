"""Note content stored in workspace/{user_id}/{note_id}.md"""

import logging
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


def _ensure_workspace() -> Path:
    root = Path(settings.workspace_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def note_path(user_id: int, note_id: int) -> Path:
    return _ensure_workspace() / str(user_id) / f"{note_id}.md"


def get_content(user_id: int, note_id: int) -> str:
    path = note_path(user_id, note_id)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def set_content(user_id: int, note_id: int, content: str) -> None:
    path = note_path(user_id, note_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def delete_content(user_id: int, note_id: int) -> None:
    path = note_path(user_id, note_id)
    if path.exists():
        path.unlink()
