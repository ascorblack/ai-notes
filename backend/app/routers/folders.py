from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Folder, Note, User
from app.schemas.folder import FolderCreate, FolderResponse, FolderTree, FolderTreeResponse, FolderUpdate, NoteRef

router = APIRouter(prefix="/folders", tags=["folders"])


async def _get_folder_for_user(
    db: AsyncSession, folder_id: int, user_id: int
) -> Folder | None:
    result = await db.execute(
        select(Folder).where(
            Folder.id == folder_id, Folder.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


@router.get("", response_model=FolderTreeResponse)
async def get_folder_tree(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FolderTreeResponse:
    result = await db.execute(
        select(Folder)
        .where(Folder.user_id == user.id)
        .order_by(Folder.order_index, Folder.id)
    )
    folders = list(result.scalars().all())

    notes_result = await db.execute(
        select(Note)
        .where(Note.user_id == user.id, Note.deleted_at.is_(None))
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
        note_refs_by_folder[n.folder_id].append(
            NoteRef(id=n.id, title=n.title, pinned=n.pinned, updated_at=n.updated_at)
        )

    roots: list[FolderTree] = []
    for f in folders:
        tree = folder_map[f.id]
        for n in note_refs_by_folder.get(f.id, []):
            tree.notes.append(n)
        if f.parent_folder_id is None:
            roots.append(tree)
        else:
            parent = folder_map.get(f.parent_folder_id)
            if parent is not None:
                parent.children.append(tree)

    root_notes = note_refs_by_folder.get(None, [])
    return FolderTreeResponse(roots=roots, root_notes=root_notes)


@router.post("", response_model=FolderResponse, status_code=201)
async def create_folder(
    data: FolderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Folder:
    if data.parent_folder_id is not None:
        parent = await _get_folder_for_user(
            db, data.parent_folder_id, user.id
        )
        if parent is None:
            raise HTTPException(status_code=400, detail="Parent folder not found")
    folder = Folder(
        user_id=user.id,
        name=data.name,
        parent_folder_id=data.parent_folder_id,
        order_index=data.order_index,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder


async def _get_descendant_folder_ids(
    db: AsyncSession, folder_id: int, user_id: int
) -> set[int]:
    result: set[int] = set()
    frontier = [folder_id]
    while frontier:
        q = select(Folder.id).where(
            Folder.user_id == user_id,
            Folder.parent_folder_id.in_(frontier),
        )
        r = await db.execute(q)
        next_ids = list(r.scalars().all())
        frontier = [i for i in next_ids if i not in result]
        result.update(next_ids)
    return result


@router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: int,
    data: FolderUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Folder:
    folder = await _get_folder_for_user(db, folder_id, user.id)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if data.name is not None:
        folder.name = data.name
    if data.parent_folder_id is not None:
        if data.parent_folder_id == 0:
            folder.parent_folder_id = None
        else:
            parent = await _get_folder_for_user(
                db, data.parent_folder_id, user.id
            )
            if parent is None:
                raise HTTPException(status_code=400, detail="Parent folder not found")
            if parent.id == folder_id:
                raise HTTPException(
                    status_code=400, detail="Folder cannot be its own parent"
                )
            descendants = await _get_descendant_folder_ids(
                db, folder_id, user.id
            )
            if parent.id in descendants:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot move folder into its own subfolder",
                )
            folder.parent_folder_id = data.parent_folder_id
    if data.order_index is not None:
        folder.order_index = data.order_index
    await db.commit()
    await db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    folder = await _get_folder_for_user(db, folder_id, user.id)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    await db.delete(folder)
    await db.commit()
