"""Service to build notes tree for a user."""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Folder, Note
from app.schemas.folder import FolderTree, FolderTreeResponse, NoteRef


async def get_notes_tree(db: AsyncSession, user_id: int) -> FolderTreeResponse:
    """Build full folder+notes tree for user."""
    result = await db.execute(
        select(Folder)
        .where(Folder.user_id == user_id)
        .order_by(Folder.order_index, Folder.id)
    )
    folders = list(result.scalars().all())

    notes_result = await db.execute(
        select(Note).where(Note.user_id == user_id, Note.deleted_at.is_(None))
    )
    notes = notes_result.scalars().all()

    folder_map: dict[int, FolderTree] = {}
    for f in folders:
        folder_map[f.id] = FolderTree(
            id=f.id,
            name=f.name,
            parent_folder_id=f.parent_folder_id,
            order_index=f.order_index,
            children=[],
            notes=[],
        )

    note_refs_by_folder: dict[int | None, list[NoteRef]] = defaultdict(list)
    for n in notes:
        note_refs_by_folder[n.folder_id].append(NoteRef(id=n.id, title=n.title))

    roots: list[FolderTree] = []
    for f in folders:
        tree = folder_map[f.id]
        for nr in note_refs_by_folder.get(f.id, []):
            tree.notes.append(nr)
        if f.parent_folder_id is None:
            roots.append(tree)
        else:
            parent = folder_map.get(f.parent_folder_id)
            if parent is not None:
                parent.children.append(tree)

    root_notes = note_refs_by_folder.get(None, [])
    return FolderTreeResponse(roots=roots, root_notes=root_notes)
