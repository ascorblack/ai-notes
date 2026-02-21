import asyncio
import logging
import re
from typing import Any

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, NoteLink
from app.services import workspace

logger = logging.getLogger(__name__)

WIKILINK_PATTERN = re.compile(r"\[\[([^\]]+)\]\]")


def parse_wikilinks(content: str) -> list[str]:
    """Extract wikilink targets from content."""
    return WIKILINK_PATTERN.findall(content)


async def update_note_links(db: AsyncSession, user_id: int, note_id: int, content: str) -> list[int]:
    """Parse wikilinks from content and update note_links table.

    Returns list of linked note IDs.
    """
    link_titles = parse_wikilinks(content)
    if not link_titles:
        await db.execute(delete(NoteLink).where(NoteLink.source_note_id == note_id))
        return []

    result = await db.execute(
        select(Note).where(Note.user_id == user_id, Note.title.in_(link_titles), Note.deleted_at.is_(None))
    )
    linked_notes = result.scalars().all()
    linked_ids = {n.id for n in linked_notes}

    existing_result = await db.execute(
        select(NoteLink).where(NoteLink.source_note_id == note_id)
    )
    existing_links = {l.target_note_id: l for l in existing_result.scalars().all()}
    existing_target_ids = set(existing_links.keys())

    to_add = linked_ids - existing_target_ids
    to_remove = existing_target_ids - linked_ids

    for target_id in to_remove:
        await db.delete(existing_links[target_id])

    for target_id in to_add:
        db.add(NoteLink(source_note_id=note_id, target_note_id=target_id))

    return list(linked_ids)


async def get_backlinks(db: AsyncSession, note_id: int) -> list[dict[str, Any]]:
    """Get notes that link to this note."""
    result = await db.execute(
        select(Note)
        .join(NoteLink, NoteLink.source_note_id == Note.id)
        .where(NoteLink.target_note_id == note_id, Note.deleted_at.is_(None))
        .order_by(NoteLink.created_at.desc())
    )
    notes = result.scalars().all()
    return [{"id": n.id, "title": n.title, "created_at": n.created_at.isoformat()} for n in notes]


async def get_graph_data(db: AsyncSession, user_id: int) -> dict[str, Any]:
    """Get nodes and edges for force-directed graph. Nodes: notes with links; edges: source_id -> target_id."""
    result = await db.execute(
        select(NoteLink)
        .join(Note, Note.id == NoteLink.source_note_id)
        .where(Note.user_id == user_id, Note.deleted_at.is_(None))
    )
    rows = result.scalars().all()
    node_ids: set[int] = set()
    edges: list[dict[str, int]] = []
    for link in rows:
        node_ids.add(link.source_note_id)
        node_ids.add(link.target_note_id)
        edges.append({"source": link.source_note_id, "target": link.target_note_id})

    if not node_ids:
        return {"nodes": [], "edges": []}

    notes_result = await db.execute(
        select(Note).where(Note.id.in_(node_ids), Note.user_id == user_id, Note.deleted_at.is_(None))
    )
    notes = {n.id: n for n in notes_result.scalars().all()}
    nodes = [{"id": nid, "title": notes[nid].title if nid in notes else ""} for nid in node_ids]
    return {"nodes": nodes, "edges": edges}


async def get_related_notes(db: AsyncSession, user_id: int, note_id: int, limit: int = 5) -> list[dict[str, Any]]:
    """Get semantically related notes using existing vector search."""
    from app.services import search

    note_result = await db.execute(select(Note).where(Note.id == note_id))
    note = note_result.scalar_one_or_none()
    if not note:
        return []

    content = workspace.get_content(user_id, note_id)
    query = ((note.title or "") + " " + (content or "")[:500]).strip()
    if not query:
        return []
    results = await asyncio.to_thread(search.search_notes, user_id, query, limit=limit + 1)

    return [
        {"id": r["note_id"], "title": r["title"], "score": r.get("score", 0)}
        for r in results
        if r["note_id"] != note_id
    ][:limit]
