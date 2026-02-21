"""Export endpoints: Obsidian vault as zip."""

import io
import re
from collections import defaultdict
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Folder, Note, User
from app.services import workspace

router = APIRouter(prefix="/export", tags=["export"])


def _sanitize_filename(name: str) -> str:
    """Make filename safe for filesystem. Obsidian uses .md."""
    s = re.sub(r'[<>:"/\\|?*]', "_", name.strip())
    s = s[:200] or "untitled"
    return s + ".md"


async def _get_folder_paths(db: AsyncSession, user_id: int) -> dict[int | None, str]:
    """Return folder_id -> path string (e.g. 'Folder/Subfolder'). None -> ''."""
    result = await db.execute(
        select(Folder).where(Folder.user_id == user_id).order_by(Folder.order_index, Folder.id)
    )
    folders = list(result.scalars().all())
    path_by_id: dict[int | None, str] = {None: ""}
    for f in folders:
        parent_path = path_by_id.get(f.parent_folder_id, "")
        path_by_id[f.id] = f"{parent_path}/{f.name}".strip("/") if parent_path else f.name
    return path_by_id


@router.get("/obsidian")
async def export_obsidian_vault(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Export all notes as Obsidian-compatible zip: folders as dirs, notes as .md files."""
    path_by_folder = await _get_folder_paths(db, user.id)

    result = await db.execute(
        select(Note).where(Note.user_id == user.id, Note.deleted_at.is_(None))
    )
    notes = list(result.scalars().all())

    seen_keys: set[str] = set()

    def make_path(note: Note) -> str:
        folder_path = path_by_folder.get(note.folder_id, "")
        base = _sanitize_filename(note.title)
        key = f"{folder_path}/{base}" if folder_path else base
        if key in seen_keys:
            stem = base.removesuffix(".md")
            idx = 1
            while key in seen_keys:
                base = f"{stem}_{idx}.md"
                key = f"{folder_path}/{base}" if folder_path else base
                idx += 1
        seen_keys.add(key)
        return key

    buf = io.BytesIO()
    with ZipFile(buf, "w", ZIP_DEFLATED) as zf:
        for note in notes:
            content = workspace.get_content(user.id, note.id) or ""
            arcname = make_path(note)
            zf.writestr(arcname, content.encode("utf-8"))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=obsidian-vault.zip"},
    )
