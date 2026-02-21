"""Tool definitions for agent tag suggestions: suggest_tags, add_tags_to_note."""

import json
import logging
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.tools.base_tool import BaseTool
from app.models import Note, NoteTag, Tag
from app.services import workspace
from app.services.agent_settings_service import get_agent_settings
from app.services.llm import chat_completion

logger = logging.getLogger(__name__)


class SuggestTagsParams(BaseModel):
    """Suggest tags for a note based on its content."""

    note_id: int = Field(..., description="ID заметки для предложения тегов")


class AddTagsToNoteParams(BaseModel):
    """Add tags to note. Creates tags by name if they don't exist."""

    note_id: int
    tag_names: list[str] = Field(..., min_length=1, max_length=10, description="Названия тегов")


class SuggestTagsTool(BaseTool):
    """Use LLM to suggest relevant tags for a note."""

    async def call(
        self,
        *,
        user_id: int,
        db: "AsyncSession",
        note_id: int,
        agent_params: dict | None = None,
        **kwargs: object,
    ) -> str:
        from sqlalchemy import select

        result = await db.execute(
            select(Note).where(
                Note.id == note_id,
                Note.user_id == user_id,
                Note.deleted_at.is_(None),
            )
        )
        note = result.scalar_one_or_none()
        if note is None:
            logger.warning("SuggestTagsTool: note not found", extra={"note_id": note_id})
            return json.dumps({"tag_names": []})

        content = workspace.get_content(user_id, note_id) or ""
        text = f"Заголовок: {note.title}\n\n{content[:1500]}"

        if agent_params is None:
            agent_params = await get_agent_settings(db, user_id, "notes")

        messages = [
            {
                "role": "system",
                "content": "По содержимому заметки предложи 2–5 релевантных тегов. Теги — короткие слова/фразы на русском или английском (проект, работа, идея, meeting, dev и т.п.). Верни ТОЛЬКО JSON: {\"tag_names\": [\"tag1\", \"tag2\"]}. Без пояснений.",
            },
            {"role": "user", "content": text},
        ]

        resp = await chat_completion(
            messages,
            base_url=agent_params.get("base_url"),
            model=agent_params.get("model"),
            api_key=agent_params.get("api_key"),
            temperature=0.3,
            max_tokens=256,
        )
        raw = resp.get("choices", [{}])[0].get("message", {}).get("content", "{}") or "{}"
        try:
            parsed = json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
            names = parsed.get("tag_names", [])
            if isinstance(names, list):
                names = [str(n).strip() for n in names if n][:5]
            else:
                names = []
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("SuggestTagsTool: LLM parse error", extra={"raw": raw[:200], "error": str(e)})
            names = []
        return json.dumps({"tag_names": names}, ensure_ascii=False)


class AddTagsToNoteTool(BaseTool):
    """Add tags to note. Creates tags by name if they don't exist."""

    async def call(
        self,
        *,
        user_id: int,
        db: "AsyncSession",
        note_id: int,
        tag_names: list[str],
        affected_ids: list[int] | None = None,
        **kwargs: object,
    ) -> str:
        from sqlalchemy import select

        note_result = await db.execute(
            select(Note).where(Note.id == note_id, Note.user_id == user_id, Note.deleted_at.is_(None))
        )
        note = note_result.scalar_one_or_none()
        if note is None:
            logger.warning("AddTagsToNoteTool: note not found", extra={"note_id": note_id})
            return "Error: note not found"

        added: list[str] = []
        for name in tag_names:
            name = (name or "").strip()
            if not name:
                continue
            tag_result = await db.execute(
                select(Tag).where(Tag.user_id == user_id, Tag.name == name)
            )
            tag = tag_result.scalar_one_or_none()
            if tag is None:
                tag = Tag(user_id=user_id, name=name)
                db.add(tag)
                await db.flush()
                if affected_ids is not None:
                    affected_ids.append(tag.id)
            existing = await db.execute(
                select(NoteTag).where(NoteTag.note_id == note_id, NoteTag.tag_id == tag.id)
            )
            if existing.scalar_one_or_none() is None:
                db.add(NoteTag(note_id=note_id, tag_id=tag.id))
                added.append(name)

        if affected_ids is not None:
            affected_ids.append(note_id)

        logger.info(
            "AddTagsToNoteTool: added",
            extra={"note_id": note_id, "added": added},
        )
        return f"Added tags: {', '.join(added)}" if added else "No new tags added"


from app.agent.tools.tool_def import ToolDefinition

SUGGEST_TAGS_TOOL_DEF = ToolDefinition(
    tool_id="suggest_tags",
    description="Предложить теги для заметки на основе её содержимого. Вызывай после create_note/append_to_note для добавления релевантных тегов. Возвращает tag_names.",
    parameters_model=SuggestTagsParams,
    instance=SuggestTagsTool(),
    timeout_seconds=30,
)

ADD_TAGS_TO_NOTE_TOOL_DEF = ToolDefinition(
    tool_id="add_tags_to_note",
    description="Добавить теги к заметке. tag_names — массив названий. Создаёт теги, если их нет. Вызывай после suggest_tags с полученными tag_names.",
    parameters_model=AddTagsToNoteParams,
    instance=AddTagsToNoteTool(),
    timeout_seconds=30,
)
