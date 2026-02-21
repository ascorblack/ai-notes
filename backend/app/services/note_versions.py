import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, NoteVersion
from app.services import workspace

logger = logging.getLogger(__name__)


async def _get_next_version(db: AsyncSession, note_id: int) -> int:
    result = await db.execute(
        select(NoteVersion.version)
        .where(NoteVersion.note_id == note_id)
        .order_by(NoteVersion.version.desc())
        .limit(1)
    )
    latest = result.scalar_one_or_none()
    return (latest or 0) + 1


async def create_version(
    db: AsyncSession,
    user_id: int,
    note_id: int,
    old_content: str | None,
    new_content: str,
) -> None:
    if old_content is None:
        return

    try:
        diff = json.dumps({"old": old_content, "new": new_content})
    except (TypeError, ValueError) as e:
        logger.warning("Failed to serialize version diff", extra={"note_id": note_id, "error": str(e)})
        diff = new_content

    version = await _get_next_version(db, note_id)
    note_version = NoteVersion(note_id=note_id, version=version, content_delta=diff)
    db.add(note_version)


async def get_note_versions(
    db: AsyncSession, user_id: int, note_id: int, limit: int = 20
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(NoteVersion)
        .join(Note, Note.id == NoteVersion.note_id)
        .where(NoteVersion.note_id == note_id, Note.user_id == user_id)
        .order_by(NoteVersion.version.desc())
        .limit(limit)
    )
    versions = result.scalars().all()
    return [
        {
            "id": v.id,
            "version": v.version,
            "content_delta": v.content_delta,
            "created_at": v.created_at.isoformat(),
        }
        for v in versions
    ]


async def restore_version(
    db: AsyncSession,
    user_id: int,
    note_id: int,
    version: int,
) -> None:
    result = await db.execute(
        select(NoteVersion).where(NoteVersion.id == version, NoteVersion.note_id == note_id)
    )
    note_version = result.scalar_one_or_none()
    if note_version is None:
        return

    try:
        data = json.loads(note_version.content_delta)
    except json.JSONDecodeError:
        return

    if isinstance(data, dict) and "old" in data:
        workspace.set_content(user_id, note_id, data["old"])

        note_result = await db.execute(
            select(Note).where(Note.id == note_id, Note.user_id == user_id)
        )
        note = note_result.scalar_one_or_none()
        if note:
            from datetime import datetime, timezone
            note.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
