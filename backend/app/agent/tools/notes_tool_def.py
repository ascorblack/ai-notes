"""Tool definitions for notes agent: create_note, append_to_note, patch_note, request_note_selection, update_user_profile."""

import difflib
import json
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.tools.base_tool import BaseTool
from app.models import Folder, Note, UserProfileFact
from app.services import search, workspace

logger = logging.getLogger(__name__)

TS_FMT = "%Y-%m-%d %H:%M:%S"


def _ts() -> str:
    return datetime.now(timezone.utc).strftime(TS_FMT)


class CreateNoteParams(BaseModel):
    """Create note. Optional folder_name creates folder; folder_id uses existing."""

    folder_id: int | None = None
    folder_name: str | None = None
    parent_folder_id: int | None = None
    title: str
    content: str = ""


class AppendToNoteParams(BaseModel):
    note_id: int
    content: str = ""


class PatchNoteParams(BaseModel):
    note_id: int
    old_text: str
    new_text: str


class CandidateItem(BaseModel):
    note_id: int
    title: str = ""


class RequestNoteSelectionParams(BaseModel):
    candidates: list[CandidateItem] = Field(
        ...,
        description="List of {note_id, title} for user to choose from",
    )


class UpdateUserProfileParams(BaseModel):
    fact: str


# --- Shared helpers (used by tools) ---


async def _get_folder_for_user(db: "AsyncSession", folder_id: int, user_id: int):
    from sqlalchemy import select

    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def _get_note_for_user(db: "AsyncSession", note_id: int, user_id: int):
    from sqlalchemy import select

    result = await db.execute(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == user_id,
            Note.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


def _execute_patch_note(content: str, old_text: str, new_text: str) -> str:
    if old_text in content:
        return content.replace(old_text, new_text, 1)
    lines = content.splitlines()
    close = difflib.get_close_matches(old_text, lines, n=1, cutoff=0.7)
    if close:
        logger.warning(
            "patch_note: used difflib fallback",
            extra={"old_preview": old_text[:50]},
        )
        return content.replace(close[0], new_text, 1)
    logger.warning(
        "patch_note: fragment not found",
        extra={"old_preview": old_text[:50]},
    )
    raise ValueError("Fragment not found")


# --- Tool implementations ---


class CreateNoteTool(BaseTool):
    """Create note. If folder_name given, creates folder first. Uses folder_id if provided."""

    async def call(
        self,
        *,
        user_id: int,
        db: "AsyncSession",
        folder_id: int | None = None,
        folder_name: str | None = None,
        parent_folder_id: int | None = None,
        title: str,
        content: str = "",
        created_ids: list[int] | None = None,
        affected_ids: list[int] | None = None,
        **kwargs: object,
    ) -> str:
        if not title:
            return "Error: title required"

        target_folder_id = folder_id
        if folder_name and folder_name.strip():
            if parent_folder_id is not None:
                parent = await _get_folder_for_user(db, parent_folder_id, user_id)
                if parent is None:
                    logger.warning(
                        "CreateNoteTool: parent folder not found",
                        extra={"parent_folder_id": parent_folder_id},
                    )
                    return "Error: parent folder not found"
            folder = Folder(
                user_id=user_id,
                name=folder_name.strip(),
                parent_folder_id=parent_folder_id,
                order_index=0,
            )
            db.add(folder)
            await db.flush()
            target_folder_id = folder.id
            if created_ids is not None:
                created_ids.append(folder.id)
            if affected_ids is not None:
                affected_ids.append(folder.id)
        elif folder_id is not None:
            folder = await _get_folder_for_user(db, folder_id, user_id)
            if folder is None:
                logger.warning(
                    "CreateNoteTool: folder not found",
                    extra={"folder_id": folder_id},
                )
                return "Error: folder not found"

        note = Note(
            user_id=user_id,
            folder_id=target_folder_id,
            title=title,
            content="",
        )
        db.add(note)
        await db.flush()
        content_full = f"Создано: {_ts()}\n\n{content}"
        workspace.set_content(user_id, note.id, content_full)
        search.index_note(user_id, note.id, note.title, content_full)
        if created_ids is not None:
            created_ids.append(note.id)
        if affected_ids is not None:
            affected_ids.append(note.id)
        return f"Created note id={note.id}"


class AppendToNoteTool(BaseTool):
    """Append block to existing note."""

    async def call(
        self,
        *,
        user_id: int,
        db: "AsyncSession",
        note_id: int,
        content: str = "",
        affected_ids: list[int] | None = None,
        **kwargs: object,
    ) -> str:
        note = await _get_note_for_user(db, note_id, user_id)
        if note is None:
            logger.warning(
                "AppendToNoteTool: note not found",
                extra={"note_id": note_id},
            )
            return "Error: note not found"
        cur = workspace.get_content(user_id, note.id)
        new_content = (cur or "") + f"\n\n--- {_ts()} ---\n\n" + content
        workspace.set_content(user_id, note.id, new_content)
        search.index_note(user_id, note.id, note.title, new_content)
        note.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if affected_ids is not None:
            affected_ids.append(note.id)
        return f"Appended to note id={note_id}"


class PatchNoteTool(BaseTool):
    """Replace fragment in note (str_replace semantics)."""

    async def call(
        self,
        *,
        user_id: int,
        db: "AsyncSession",
        note_id: int,
        old_text: str,
        new_text: str,
        affected_ids: list[int] | None = None,
        **kwargs: object,
    ) -> str:
        if not old_text:
            return "Error: old_text required"
        note = await _get_note_for_user(db, note_id, user_id)
        if note is None:
            logger.warning(
                "PatchNoteTool: note not found",
                extra={"note_id": note_id},
            )
            return "Error: note not found"
        cur = workspace.get_content(user_id, note.id)
        new_content = _execute_patch_note(cur, old_text, new_text)
        workspace.set_content(user_id, note.id, new_content)
        search.index_note(user_id, note.id, note.title, new_content)
        note.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if affected_ids is not None:
            affected_ids.append(note.id)
        return f"Patched note id={note_id}"


class RequestNoteSelectionTool(BaseTool):
    """Return candidates for user to select. Executor handles special response."""

    async def call(
        self,
        *,
        user_id: int,
        db: "AsyncSession",
        candidates: list,
        **kwargs: object,
    ) -> str:
        validated: list[dict[str, Any]] = []
        for c in (candidates or [])[:20]:
            nid = c.get("note_id") if isinstance(c, dict) else getattr(c, "note_id", None)
            title = (c.get("title") or "") if isinstance(c, dict) else (getattr(c, "title", None) or "")
            if nid is None:
                continue
            try:
                nid = int(nid)
            except (TypeError, ValueError):
                continue
            note = await _get_note_for_user(db, nid, user_id)
            if note is not None:
                validated.append({"note_id": nid, "title": title or note.title})
        return json.dumps({"candidates": validated}, ensure_ascii=False)


class UpdateUserProfileTool(BaseTool):
    """Add fact to user profile memory."""

    async def call(
        self,
        *,
        user_id: int,
        db: "AsyncSession",
        fact: str,
        **kwargs: object,
    ) -> str:
        fact = fact.strip()
        if not fact:
            return "No fact to add"
        from sqlalchemy import select

        existing = await db.execute(
            select(UserProfileFact.fact).where(UserProfileFact.user_id == user_id)
        )
        existing_facts = {r[0].strip().lower() for r in existing.all()}
        fact_normalized = fact.lower()
        if fact_normalized not in existing_facts:
            db.add(UserProfileFact(user_id=user_id, fact=fact))
            await db.flush()
            logger.info(
                "UpdateUserProfileTool: added fact",
                extra={"user_id": user_id, "fact_preview": fact[:50]},
            )
        return "Profile updated"


# --- ToolDefinition constants ---

from app.agent.tools.tool_def import ToolDefinition

CREATE_NOTE_TOOL_DEF = ToolDefinition(
    tool_id="create_note",
    description="Создать заметку. folder_id — id существующей папки или null. folder_name — создать новую папку (parent_folder_id — родитель для подпапки). Если ничего не указано — корень.",
    parameters_model=CreateNoteParams,
    instance=CreateNoteTool(),
    timeout_seconds=30,
)

APPEND_TO_NOTE_TOOL_DEF = ToolDefinition(
    tool_id="append_to_note",
    description="Добавить блок в конец существующей заметки",
    parameters_model=AppendToNoteParams,
    instance=AppendToNoteTool(),
    timeout_seconds=30,
)

PATCH_NOTE_TOOL_DEF = ToolDefinition(
    tool_id="patch_note",
    description="Заменить конкретный фрагмент текста (str_replace семантика)",
    parameters_model=PatchNoteParams,
    instance=PatchNoteTool(),
    timeout_seconds=30,
)

REQUEST_NOTE_SELECTION_TOOL_DEF = ToolDefinition(
    tool_id="request_note_selection",
    description="Пользователь просит изменить заметку, но не указал какую. Подходят несколько. Верни candidates: [{note_id, title}]. Только когда 2+ заметок подходят.",
    parameters_model=RequestNoteSelectionParams,
    instance=RequestNoteSelectionTool(),
    timeout_seconds=15,
)

UPDATE_USER_PROFILE_TOOL_DEF = ToolDefinition(
    tool_id="update_user_profile",
    description="Добавить факт о пользователе. Формат: «Пользователь X. Идеи по Y класть в папку Z.»",
    parameters_model=UpdateUserProfileParams,
    instance=UpdateUserProfileTool(),
    timeout_seconds=15,
)
