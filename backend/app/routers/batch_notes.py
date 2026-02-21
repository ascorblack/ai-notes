"""Batch operations on notes (move, delete)."""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Folder, Note, User
from app.schemas.note import BatchDeleteRequest, BatchMoveRequest
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


@router.post("/batch/move", status_code=204)
async def batch_move_notes(
    body: BatchMoveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    target_folder_id = body.target_folder_id
    for note_id in body.note_ids:
        note = await _get_note_for_user(db, note_id, user.id)
        if note:
            if target_folder_id is None:
                note.folder_id = None
            elif target_folder_id == 0:
                note.folder_id = None
            else:
                folder_result = await db.execute(
                    select(Folder).where(
                        Folder.id == target_folder_id, Folder.user_id == user.id
                    )
                )
                if folder_result.scalar_one_or_none():
                    note.folder_id = target_folder_id
    await db.commit()


@router.delete("/batch", status_code=204)
async def batch_delete_notes(
    body: BatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    for note_id in body.note_ids:
        note = await _get_note_for_user(db, note_id, user.id)
        if note:
            search.delete_note(user.id, note.id)
            workspace.delete_content(user.id, note.id)
            note.deleted_at = func.now()
    await db.commit()
