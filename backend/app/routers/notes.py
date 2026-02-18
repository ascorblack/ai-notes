from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Folder, Note, User
from app.schemas.note import NoteCreate, NoteResponse, NoteUpdate, TrashItem
from app.services import search, workspace

router = APIRouter(prefix="/notes", tags=["notes"])


async def _get_note_for_user(
    db: AsyncSession, note_id: int, user_id: int, include_deleted: bool = False
) -> Note | None:
    q = select(Note).where(Note.id == note_id, Note.user_id == user_id)
    if not include_deleted:
        q = q.where(Note.deleted_at.is_(None))
    result = await db.execute(q)
    return result.scalar_one_or_none()


@router.get("/trash", response_model=list[TrashItem])
async def list_trash(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TrashItem]:
    result = await db.execute(
        select(Note)
        .where(Note.user_id == user.id, Note.deleted_at.isnot(None))
        .order_by(Note.deleted_at.desc())
    )
    notes = result.scalars().all()
    return [
        TrashItem(id=n.id, title=n.title, folder_id=n.folder_id, deleted_at=n.deleted_at)
        for n in notes
    ]


@router.post("/trash/{note_id}/restore", status_code=204)
async def restore_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    note = await _get_note_for_user(db, note_id, user.id, include_deleted=True)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.deleted_at is None:
        raise HTTPException(status_code=400, detail="Note is not in trash")
    content = workspace.get_content(user.id, note.id)
    note.deleted_at = None
    await db.commit()
    search.index_note(user.id, note.id, note.title, content)


@router.delete("/trash/{note_id}", status_code=204)
async def permanent_delete_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    note = await _get_note_for_user(db, note_id, user.id, include_deleted=True)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    search.delete_note(user.id, note.id)
    workspace.delete_content(user.id, note.id)
    await db.delete(note)
    await db.commit()


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NoteResponse:
    note = await _get_note_for_user(db, note_id, user.id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    content = workspace.get_content(user.id, note.id)
    return NoteResponse(
        id=note.id,
        folder_id=note.folder_id,
        title=note.title,
        content=content,
        created_at=note.created_at,
        updated_at=note.updated_at,
        is_task=note.is_task,
        subtasks=note.subtasks,
        completed_at=note.completed_at,
    )


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(
    data: NoteCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NoteResponse:
    if data.folder_id is not None:
        result = await db.execute(
            select(Folder).where(
                Folder.id == data.folder_id, Folder.user_id == user.id
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Folder not found")
    subtasks_data: list[dict[str, Any]] | None = None
    if data.subtasks:
        subtasks_data = [s.model_dump() for s in data.subtasks]
    note = Note(
        user_id=user.id,
        folder_id=data.folder_id,
        title=data.title,
        content="",
        is_task=data.is_task,
        subtasks=subtasks_data,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    content_with_ts = f"Создано: {ts}\n\n{data.content}"
    workspace.set_content(user.id, note.id, content_with_ts)
    search.index_note(user.id, note.id, note.title, content_with_ts)
    return NoteResponse(
        id=note.id,
        folder_id=note.folder_id,
        title=note.title,
        content=content_with_ts,
        created_at=note.created_at,
        updated_at=note.updated_at,
        is_task=note.is_task,
        subtasks=note.subtasks,
        completed_at=note.completed_at,
    )


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: int,
    data: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NoteResponse:
    note = await _get_note_for_user(db, note_id, user.id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    if data.title is not None:
        note.title = data.title
    if data.content is not None:
        workspace.set_content(user.id, note.id, data.content)
        note.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if data.folder_id is not None:
        if data.folder_id != 0:
            result = await db.execute(
                select(Folder).where(
                    Folder.id == data.folder_id, Folder.user_id == user.id
                )
            )
            if result.scalar_one_or_none() is None:
                raise HTTPException(status_code=400, detail="Folder not found")
            note.folder_id = data.folder_id
        else:
            note.folder_id = None
    if data.is_task is not None:
        note.is_task = data.is_task
    if data.subtasks is not None:
        note.subtasks = [s.model_dump() for s in data.subtasks]
    await db.commit()
    await db.refresh(note)
    content = workspace.get_content(user.id, note.id)
    search.index_note(user.id, note.id, note.title, content)
    return NoteResponse(
        id=note.id,
        folder_id=note.folder_id,
        title=note.title,
        content=content,
        created_at=note.created_at,
        updated_at=note.updated_at,
        is_task=note.is_task,
        subtasks=note.subtasks,
        completed_at=note.completed_at,
    )


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    note = await _get_note_for_user(db, note_id, user.id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    search.delete_note(user.id, note.id)
    note.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
