"""Tool definitions for task agent: create_task, update_user_profile."""

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from app.agent.tools.base_tool import BaseTool
from app.agent.tools.tool_def import ToolDefinition
from app.models import Folder, Note
from app.services import search, workspace

logger = logging.getLogger(__name__)

TS_FMT = "%Y-%m-%d %H:%M:%S"
TASKS_FOLDER_NAME = "Задачи"


def _ts() -> str:
    return datetime.now(timezone.utc).strftime(TS_FMT)


class SubtaskItem(BaseModel):
    text: str
    done: bool = False


class CreateTaskParams(BaseModel):
    title: str
    content: str = Field(
        default="",
        description="Текст задачи в Markdown: описание, контекст, детали. Обязательно заполняй — извлеки из запроса всё важное.",
    )
    category: str | None = None
    subtasks: list[SubtaskItem] | None = None


async def _get_or_create_tasks_folder(db: "AsyncSession", user_id: int) -> Folder:
    result = await db.execute(
        select(Folder).where(
            Folder.user_id == user_id,
            Folder.name == TASKS_FOLDER_NAME,
            Folder.parent_folder_id.is_(None),
        )
    )
    folder = result.scalar_one_or_none()
    if folder is not None:
        return folder
    folder = Folder(
        user_id=user_id,
        name=TASKS_FOLDER_NAME,
        parent_folder_id=None,
        order_index=0,
    )
    db.add(folder)
    await db.flush()
    logger.info("Created tasks folder", extra={"user_id": user_id, "folder_id": folder.id})
    return folder


async def _get_or_create_task_category(
    db: "AsyncSession", parent_folder: Folder, category_name: str, user_id: int
) -> Folder:
    name = category_name.strip() if category_name else ""
    if not name:
        return parent_folder
    result = await db.execute(
        select(Folder).where(
            Folder.user_id == user_id,
            Folder.parent_folder_id == parent_folder.id,
            Folder.name == name,
        )
    )
    folder = result.scalar_one_or_none()
    if folder is not None:
        return folder
    folder = Folder(
        user_id=user_id,
        name=name,
        parent_folder_id=parent_folder.id,
        order_index=0,
    )
    db.add(folder)
    await db.flush()
    logger.info(
        "Created task category folder",
        extra={"user_id": user_id, "name": name},
    )
    return folder


class CreateTaskTool(BaseTool):
    """Create task (no date/time). Goes to Tasks folder, optional category subfolder."""

    async def call(
        self,
        *,
        user_id: int,
        db: "AsyncSession",
        title: str,
        content: str = "",
        category: str | None = None,
        subtasks: list[dict[str, Any]] | None = None,
        created_ids: list[int] | None = None,
        affected_ids: list[int] | None = None,
        **kwargs: object,
    ) -> str:
        if not title:
            return "Error: title required"
        tasks_folder = await _get_or_create_tasks_folder(db, user_id)
        target_folder = await _get_or_create_task_category(
            db, tasks_folder, category or "", user_id
        )
        subtasks_data: list[dict[str, Any]] | None = None
        if isinstance(subtasks, list) and subtasks:
            subtasks_data = []
            for st in subtasks:
                if isinstance(st, dict) and st.get("text"):
                    subtasks_data.append({
                        "text": st["text"],
                        "done": bool(st.get("done", False)),
                    })
        note = Note(
            user_id=user_id,
            folder_id=target_folder.id,
            title=title,
            content="",
            is_task=True,
            subtasks=subtasks_data,
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
        return f"Created task id={note.id}"


CREATE_TASK_TOOL_DEF = ToolDefinition(
    tool_id="create_task",
    description="Создать ЗАДАЧУ (без даты/времени). content: описание задачи в Markdown — ОБЯЗАТЕЛЬНО заполняй. category: Работа, Дом, Здоровье, Учёба. subtasks: [{text, done}] — подзадачи/чекбоксы.",
    parameters_model=CreateTaskParams,
    instance=CreateTaskTool(),
    timeout_seconds=30,
)
