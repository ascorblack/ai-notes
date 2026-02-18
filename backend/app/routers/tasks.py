from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Folder, Note, User
from app.schemas.note import TaskCategory, TaskResponse
from app.services.agent import TASKS_FOLDER_NAME
from app.services import workspace

router = APIRouter(prefix="/tasks", tags=["tasks"])


class SubtaskUpdate(BaseModel):
    subtasks: list[dict[str, Any]]


async def _get_tasks_folder(db: AsyncSession, user_id: int) -> Folder | None:
    result = await db.execute(
        select(Folder).where(
            Folder.user_id == user_id,
            Folder.name == TASKS_FOLDER_NAME,
            Folder.parent_folder_id.is_(None),
        )
    )
    return result.scalar_one_or_none()


@router.get("/categories", response_model=list[TaskCategory])
async def list_task_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TaskCategory]:
    """Returns task categories: Без категории (root) + subfolders of Задачи."""
    tasks_folder = await _get_tasks_folder(db, user.id)
    if tasks_folder is None:
        return []
    out = [TaskCategory(id=tasks_folder.id, name="Без категории")]
    result = await db.execute(
        select(Folder)
        .where(Folder.parent_folder_id == tasks_folder.id, Folder.user_id == user.id)
        .order_by(Folder.name)
    )
    out.extend(TaskCategory(id=f.id, name=f.name) for f in result.scalars().all())
    return out


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    include_completed: bool = False,
    folder_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TaskResponse]:
    tasks_folder = await _get_tasks_folder(db, user.id)
    if tasks_folder is None:
        return []

    q = select(Note).where(
        Note.user_id == user.id,
        Note.is_task == True,
        Note.deleted_at.is_(None),
    )
    valid_folder_ids = [tasks_folder.id]
    children_result = await db.execute(
        select(Folder.id).where(Folder.parent_folder_id == tasks_folder.id)
    )
    valid_folder_ids.extend(r[0] for r in children_result.all())
    if folder_id is not None:
        if folder_id not in valid_folder_ids:
            raise HTTPException(status_code=400, detail="Invalid folder_id for tasks")
        q = q.where(Note.folder_id == folder_id)
    else:
        q = q.where(Note.folder_id.in_(valid_folder_ids))
    if not include_completed:
        q = q.where(Note.completed_at.is_(None))
    q = q.order_by(Note.created_at.desc())
    result = await db.execute(q)
    notes = result.scalars().all()
    tasks = []
    for n in notes:
        content = workspace.get_content(user.id, n.id)
        tasks.append(
            TaskResponse(
                id=n.id,
                title=n.title,
                content=content or "",
                subtasks=n.subtasks,
                completed_at=n.completed_at,
                created_at=n.created_at,
                updated_at=n.updated_at,
                folder_id=n.folder_id,
            )
        )
    return tasks


@router.patch("/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskResponse:
    result = await db.execute(
        select(Note).where(
            Note.id == task_id,
            Note.user_id == user.id,
            Note.is_task == True,
            Note.deleted_at.is_(None),
        )
    )
    note = result.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="Task not found")
    note.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(note)
    content = workspace.get_content(user.id, note.id)
    return TaskResponse(
        id=note.id,
        title=note.title,
        content=content or "",
        subtasks=note.subtasks,
        completed_at=note.completed_at,
        created_at=note.created_at,
        updated_at=note.updated_at,
        folder_id=note.folder_id,
    )


@router.patch("/{task_id}/uncomplete", response_model=TaskResponse)
async def uncomplete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskResponse:
    result = await db.execute(
        select(Note).where(
            Note.id == task_id,
            Note.user_id == user.id,
            Note.is_task == True,
            Note.deleted_at.is_(None),
        )
    )
    note = result.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="Task not found")
    note.completed_at = None
    await db.commit()
    await db.refresh(note)
    content = workspace.get_content(user.id, note.id)
    return TaskResponse(
        id=note.id,
        title=note.title,
        content=content or "",
        subtasks=note.subtasks,
        completed_at=note.completed_at,
        created_at=note.created_at,
        updated_at=note.updated_at,
        folder_id=note.folder_id,
    )


@router.patch("/{task_id}/subtasks", response_model=TaskResponse)
async def update_subtasks(
    task_id: int,
    data: SubtaskUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskResponse:
    result = await db.execute(
        select(Note).where(
            Note.id == task_id,
            Note.user_id == user.id,
            Note.is_task == True,
            Note.deleted_at.is_(None),
        )
    )
    note = result.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="Task not found")
    note.subtasks = data.subtasks
    note.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(note)
    content = workspace.get_content(user.id, note.id)
    return TaskResponse(
        id=note.id,
        title=note.title,
        content=content or "",
        subtasks=note.subtasks,
        completed_at=note.completed_at,
        created_at=note.created_at,
        updated_at=note.updated_at,
        folder_id=note.folder_id,
    )
