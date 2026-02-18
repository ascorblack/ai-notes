from fastapi import APIRouter, Depends, HTTPException, Query

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Note, User
from app.services import search, workspace

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def search_notes_endpoint(
    q: str = Query(..., min_length=1, max_length=500),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hybrid search over notes. Returns [{id, title, folder_id, snippet}]."""
    try:
        results = search.search_notes(user.id, q, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Search unavailable: {e}") from e

    notes_result = await db.execute(
        select(Note.id, Note.folder_id, Note.title).where(
            Note.user_id == user.id,
            Note.deleted_at.is_(None),
            Note.id.in_([r["note_id"] for r in results]),
        )
    )
    note_map = {r[0]: {"folder_id": r[1], "title": r[2]} for r in notes_result.all()}

    out = []
    for r in results:
        nid = r["note_id"]
        meta = note_map.get(nid, {})
        out.append({
            "id": nid,
            "title": r.get("title") or meta.get("title", ""),
            "folder_id": meta.get("folder_id"),
            "snippet": r.get("snippet", ""),
        })
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
