from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Folder, Note, NoteTag, Tag, User
from app.schemas.note import NoteCreate, NoteResponse, NoteUpdate, TrashItem
from app.services import search, workspace
from app.services.note_links import get_backlinks, get_graph_data, get_related_notes, update_note_links
from app.services.note_versions import create_version, get_note_versions, restore_version

router = APIRouter(prefix="/notes", tags=["notes"])


async def _get_note_tags(db: AsyncSession, note_id: int) -> list[dict]:
    result = await db.execute(
        select(Tag).join(NoteTag, NoteTag.tag_id == Tag.id).where(NoteTag.note_id == note_id)
    )
    tags = result.scalars().all()
    return [{"id": t.id, "name": t.name, "color": t.color} for t in tags]


async def _get_note_for_user(
    db: AsyncSession, note_id: int, user_id: int, include_deleted: bool = False
) -> Note | None:
    q = select(Note).where(Note.id == note_id, Note.user_id == user_id)
    if not include_deleted:
        q = q.where(Note.deleted_at.is_(None))
    result = await db.execute(q)
    return result.scalar_one_or_none()


DAILY_NOTE_PREFIX = "Daily "


@router.get("/daily", response_model=NoteResponse)
async def get_or_create_daily_note(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NoteResponse:
    """Get or create today's daily note. Title format: Daily YYYY-MM-DD."""
    from datetime import date

    today = date.today().isoformat()
    title = f"{DAILY_NOTE_PREFIX}{today}"
    result = await db.execute(
        select(Note).where(
            Note.user_id == user.id,
            Note.title == title,
            Note.deleted_at.is_(None),
        )
    )
    note = result.scalar_one_or_none()
    if note is not None:
        content = workspace.get_content(user.id, note.id)
        tags = await _get_note_tags(db, note.id)
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
            deadline=note.deadline,
            priority=note.priority,
            tags=tags,
            pinned=note.pinned,
            created=False,
        )
    note = Note(
        user_id=user.id,
        folder_id=None,
        title=title,
        content="",
        is_task=False,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    content = f"Created: {ts}\n\n"
    workspace.set_content(user.id, note.id, content)
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
        deadline=note.deadline,
        priority=note.priority,
        tags=[],
        pinned=note.pinned,
        created=True,
    )


@router.get("/graph")
async def get_graph(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get nodes and edges for force-directed graph of note links."""
    return await get_graph_data(db, user.id)


@router.post("/{note_id}/summarize", response_model=NoteResponse)
async def summarize_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NoteResponse:
    """Summarize note content and prepend as callout block."""
    note = await _get_note_for_user(db, note_id, user.id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    content = workspace.get_content(user.id, note.id)
    if not content or len(content.strip()) < 50:
        raise HTTPException(status_code=400, detail="Note too short to summarize")

    from app.services.llm import chat_completion
    from app.services.agent_settings_service import get_agent_settings

    agent_params = await get_agent_settings(db, user.id, "notes")
    messages = [
        {"role": "user", "content": f"""Суммаризируй заметку в 3-5 тезисов. Язык как в заметке.
Верни ТОЛЬКО текст в формате:
> **Summary**
- тезис 1
- тезис 2

Заметка:
{content[:8000]}"""},
    ]
    try:
        choice = await chat_completion(
            messages,
            base_url=agent_params.get("base_url"),
            model=agent_params.get("model"),
            api_key=agent_params.get("api_key") or None,
            temperature=0.3,
        )
        msg = choice.get("message", choice)
        if isinstance(msg, dict):
            summary = (msg.get("content") or "").strip()
        else:
            summary = str(msg).strip()
        if not summary or len(summary) < 10:
            raise HTTPException(status_code=500, detail="Empty summary from LLM")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    new_content = f"{summary}\n\n---\n\n{content}"
    workspace.set_content(user.id, note.id, new_content)
    note.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(note)
    search.index_note(user.id, note.id, note.title, new_content)
    tags = await _get_note_tags(db, note.id)
    return NoteResponse(
        id=note.id,
        folder_id=note.folder_id,
        title=note.title,
        content=new_content,
        created_at=note.created_at,
        updated_at=note.updated_at,
        is_task=note.is_task,
        subtasks=note.subtasks,
        completed_at=note.completed_at,
        deadline=note.deadline,
        priority=note.priority,
        tags=tags,
        pinned=note.pinned,
    )


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
    tags = await _get_note_tags(db, note.id)
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
        deadline=note.deadline,
        priority=note.priority,
        tags=tags,
        pinned=note.pinned,
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
        deadline=data.deadline,
        priority=data.priority,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    content_with_ts = f"Created: {ts}\n\n{data.content}"
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
        deadline=note.deadline,
        priority=note.priority,
        tags=[],
        pinned=note.pinned,
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
    
    old_content = None
    if data.title is not None:
        note.title = data.title
    if data.content is not None:
        old_content = workspace.get_content(user.id, note.id)
        workspace.set_content(user.id, note.id, data.content)
        note.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await create_version(db, user.id, note.id, old_content, data.content)
        await update_note_links(db, user.id, note.id, data.content)
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
    if data.deadline is not None:
        note.deadline = data.deadline
    if data.priority is not None:
        note.priority = data.priority
    if data.pinned is not None:
        note.pinned = data.pinned
    await db.commit()
    await db.refresh(note)
    content = workspace.get_content(user.id, note.id)
    search.index_note(user.id, note.id, note.title, content)
    tags = await _get_note_tags(db, note.id)
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
        deadline=note.deadline,
        priority=note.priority,
        tags=tags,
        pinned=note.pinned,
    )


@router.post("/{note_id}/duplicate", response_model=NoteResponse, status_code=201)
async def duplicate_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NoteResponse:
    note = await _get_note_for_user(db, note_id, user.id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    content = workspace.get_content(user.id, note.id)
    new_note = Note(
        user_id=user.id,
        folder_id=note.folder_id,
        title=f"{note.title} (копия)",
        content="",
        is_task=note.is_task,
        subtasks=note.subtasks,
        deadline=note.deadline,
        priority=note.priority,
    )
    db.add(new_note)
    await db.commit()
    await db.refresh(new_note)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    content_with_ts = f"Created: {ts}\n\n{content}"
    workspace.set_content(user.id, new_note.id, content_with_ts)
    search.index_note(user.id, new_note.id, new_note.title, content_with_ts)
    tags = await _get_note_tags(db, note.id)
    if tags:
        for t in tags:
            nt = NoteTag(note_id=new_note.id, tag_id=t["id"])
            db.add(nt)
        await db.commit()
    tags_new = await _get_note_tags(db, new_note.id)
    return NoteResponse(
        id=new_note.id,
        folder_id=new_note.folder_id,
        title=new_note.title,
        content=content_with_ts,
        created_at=new_note.created_at,
        updated_at=new_note.updated_at,
        is_task=new_note.is_task,
        subtasks=new_note.subtasks,
        completed_at=new_note.completed_at,
        deadline=new_note.deadline,
        priority=new_note.priority,
        tags=tags_new,
        pinned=new_note.pinned,
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


@router.get("/{note_id}/backlinks")
async def list_backlinks(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await _get_note_for_user(db, note_id, user.id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return await get_backlinks(db, note_id)


@router.get("/{note_id}/related")
async def list_related(
    note_id: int,
    limit: int = 5,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await _get_note_for_user(db, note_id, user.id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return await get_related_notes(db, user.id, note_id, limit)


@router.get("/{note_id}/versions")
async def list_versions(
    note_id: int,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await _get_note_for_user(db, note_id, user.id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return await get_note_versions(db, user.id, note_id, limit)


@router.post("/{note_id}/restore/{version}")
async def restore_note_version(
    note_id: int,
    version: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await _get_note_for_user(db, note_id, user.id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    await restore_version(db, user.id, note_id, version)
    await db.commit()
    await db.refresh(note)
    content = workspace.get_content(user.id, note.id)
    tags = await _get_note_tags(db, note.id)
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
        deadline=note.deadline,
        priority=note.priority,
        tags=tags,
        pinned=note.pinned,
    )
