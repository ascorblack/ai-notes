from fastapi import APIRouter, Depends, HTTPException, Query

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Note, NoteTag, User
from app.services import search, workspace

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def search_notes_endpoint(
    q: str = Query(..., min_length=1, max_length=500),
    limit: int = Query(10, ge=1, le=50),
    folder_id: int | None = Query(None, description="Filter by folder"),
    tag_id: int | None = Query(None, description="Filter by tag"),
    type_filter: str | None = Query(None, alias="type", description="'note' or 'task'"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hybrid search over notes. Returns [{id, title, folder_id, snippet}]. Optional filters: folder_id, tag_id, type."""
    try:
        results = search.search_notes(user.id, q, limit=limit * 2)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Search unavailable: {e}") from e

    if not results:
        return []

    note_ids = [r["note_id"] for r in results]
    qry = select(Note.id, Note.folder_id, Note.title).where(
        Note.user_id == user.id,
        Note.deleted_at.is_(None),
        Note.id.in_(note_ids),
    )
    if folder_id is not None:
        if folder_id == 0:
            qry = qry.where(Note.folder_id.is_(None))
        else:
            qry = qry.where(Note.folder_id == folder_id)
    if type_filter == "task":
        qry = qry.where(Note.is_task.is_(True))
    elif type_filter == "note":
        qry = qry.where(Note.is_task.is_(False) | Note.is_task.is_(None))
    if tag_id is not None:
        qry = qry.join(NoteTag, NoteTag.note_id == Note.id).where(NoteTag.tag_id == tag_id)

    notes_result = await db.execute(qry)
    rows = notes_result.all()
    note_map = {r[0]: {"folder_id": r[1], "title": r[2]} for r in rows}
    allowed_ids = set(note_map.keys())

    out = []
    for r in results:
        nid = r["note_id"]
        if nid not in allowed_ids:
            continue
        meta = note_map.get(nid, {})
        out.append({
            "id": nid,
            "title": r.get("title") or meta.get("title", ""),
            "folder_id": meta.get("folder_id"),
            "snippet": r.get("snippet", ""),
        })
        if len(out) >= limit:
            break
    return out


@router.post("/reindex")
async def reindex(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reindex all notes for the current user."""
    result = await db.execute(
        select(Note).where(Note.user_id == user.id, Note.deleted_at.is_(None))
    )
    notes = list(result.scalars().all())
    count = 0
    for note in notes:
        content = workspace.get_content(user.id, note.id)
        search.index_note(user.id, note.id, note.title, content)
        count += 1
    return {"reindexed": count}
