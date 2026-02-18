"""Tool definitions for event agent: create_note_with_event, update_user_profile."""

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.tools.base_tool import BaseTool
from app.agent.tools.notes_tool_def import (
    _get_folder_for_user,
    UPDATE_USER_PROFILE_TOOL_DEF,
)
from app.agent.tools.tool_def import ToolDefinition
from app.models import Event, Note
from app.services import search, workspace

logger = logging.getLogger(__name__)

TS_FMT = "%Y-%m-%d %H:%M:%S"


def _ts() -> str:
    return datetime.now(timezone.utc).strftime(TS_FMT)


class CreateNoteWithEventParams(BaseModel):
    folder_id: int | None = None
    title: str
    content: str = ""
    starts_at: str
    ends_at: str


class CreateNoteWithEventTool(BaseTool):
    """Create note + calendar event. Required: title, starts_at, ends_at (ISO 8601)."""

    async def call(
        self,
        *,
        user_id: int,
        db: "AsyncSession",
        folder_id: int | None = None,
        title: str,
        content: str = "",
        starts_at: str,
        ends_at: str,
        created_ids: list[int] | None = None,
        affected_ids: list[int] | None = None,
        **kwargs: object,
    ) -> str:
        if not title or not starts_at or not ends_at:
            logger.warning(
                "CreateNoteWithEventTool: missing required fields",
                extra={"title": bool(title), "starts_at": bool(starts_at), "ends_at": bool(ends_at)},
            )
            return "Error: title, starts_at, ends_at required"
        if folder_id is not None:
            folder = await _get_folder_for_user(db, folder_id, user_id)
            if folder is None:
                logger.warning(
                    "CreateNoteWithEventTool: folder not found",
                    extra={"folder_id": folder_id},
                )
                return "Error: folder not found"
        try:
            starts_dt = datetime.fromisoformat(starts_at.replace("Z", "+00:00"))
            ends_dt = datetime.fromisoformat(ends_at.replace("Z", "+00:00"))
        except (ValueError, TypeError) as e:
            logger.error(
                "CreateNoteWithEventTool: invalid datetime",
                extra={"starts_at": starts_at, "ends_at": ends_at, "error": str(e)},
            )
            return f"Error: invalid datetime: {e}"
        if starts_dt.tzinfo is None:
            starts_dt = starts_dt.replace(tzinfo=timezone.utc)
        if ends_dt.tzinfo is None:
            ends_dt = ends_dt.replace(tzinfo=timezone.utc)
        note = Note(
            user_id=user_id,
            folder_id=folder_id,
            title=title,
            content="",
        )
        db.add(note)
        await db.flush()
        content_full = f"Создано: {_ts()}\n\n{content}"
        workspace.set_content(user_id, note.id, content_full)
        search.index_note(user_id, note.id, note.title, content_full)
        event = Event(
            user_id=user_id,
            note_id=note.id,
            title=title,
            starts_at=starts_dt,
            ends_at=ends_dt,
        )
        db.add(event)
        if created_ids is not None:
            created_ids.append(note.id)
        if affected_ids is not None:
            affected_ids.append(note.id)
        return f"Created note+event id={note.id}"


CREATE_NOTE_WITH_EVENT_TOOL_DEF = ToolDefinition(
    tool_id="create_note_with_event",
    description="Создать заметку + событие в календаре. starts_at/ends_at в ISO 8601. Для напоминаний, встреч, «завтра в 15:00».",
    parameters_model=CreateNoteWithEventParams,
    instance=CreateNoteWithEventTool(),
    timeout_seconds=30,
)
