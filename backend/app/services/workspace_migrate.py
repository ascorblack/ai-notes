"""One-time: copy note content from DB to workspace files for existing notes."""

import asyncio
import logging

from sqlalchemy import select

from app.database import async_session_maker
from app.models import Note
from app.services import workspace

logger = logging.getLogger(__name__)


async def migrate_db_content_to_workspace() -> int:
    """Copy content from notes.content (DB) to workspace files where file doesn't exist. Returns count migrated."""
    migrated = 0
    async with async_session_maker() as session:
        result = await session.execute(select(Note))
        for note in result.scalars().all():
            if not note.content:
                continue
            path = workspace.note_path(note.user_id, note.id)
            if path.exists():
                continue
            workspace.set_content(note.user_id, note.id, note.content)
            migrated += 1
    if migrated:
        logger.info("Migrated %s notes from DB to workspace", migrated)
    return migrated
