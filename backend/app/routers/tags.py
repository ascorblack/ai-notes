from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Note, NoteTag, Tag, User
from app.schemas.tag import TagCreate, TagResponse, TagUpdate, NoteTagsUpdate

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagResponse])
async def list_tags(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TagResponse]:
    result = await db.execute(
        select(Tag).where(Tag.user_id == user.id).order_by(Tag.name)
    )
    tags = result.scalars().all()
    return [TagResponse.model_validate(t) for t in tags]


@router.post("", response_model=TagResponse, status_code=201)
async def create_tag(
    data: TagCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TagResponse:
    existing = await db.execute(
        select(Tag).where(Tag.user_id == user.id, Tag.name == data.name)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Tag already exists")

    tag = Tag(user_id=user.id, name=data.name, color=data.color)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return TagResponse.model_validate(tag)


@router.patch("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: int,
    data: TagUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TagResponse:
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id)
    )
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")

    if data.name is not None:
        existing = await db.execute(
            select(Tag).where(
                Tag.user_id == user.id,
                Tag.name == data.name,
                Tag.id != tag_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="Tag name already in use")
        tag.name = data.name

    if data.color is not None:
        tag.color = data.color

    await db.commit()
    await db.refresh(tag)
    return TagResponse.model_validate(tag)


@router.get("/{tag_id}/notes", response_model=list[int])
async def list_notes_by_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[int]:
    """Return note IDs that have this tag."""
    result = await db.execute(
        select(NoteTag.note_id).join(Note, Note.id == NoteTag.note_id).where(
            NoteTag.tag_id == tag_id,
            Note.user_id == user.id,
            Note.deleted_at.is_(None),
        )
    )
    return [r[0] for r in result.all()]


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id)
    )
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    await db.delete(tag)
    await db.commit()


@router.get("/notes/{note_id}", response_model=list[TagResponse])
async def get_note_tags(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TagResponse]:
    note_result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    if note_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Note not found")

    result = await db.execute(
        select(Tag)
        .join(NoteTag, NoteTag.tag_id == Tag.id)
        .where(NoteTag.note_id == note_id)
        .order_by(Tag.name)
    )
    tags = result.scalars().all()
    return [TagResponse.model_validate(t) for t in tags]


@router.put("/notes/{note_id}", response_model=list[TagResponse])
async def set_note_tags(
    note_id: int,
    data: NoteTagsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TagResponse]:
    note_result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = note_result.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")

    await db.execute(delete(NoteTag).where(NoteTag.note_id == note_id))

    if data.tag_ids:
        tags_result = await db.execute(
            select(Tag).where(
                Tag.id.in_(data.tag_ids),
                Tag.user_id == user.id,
            )
        )
        valid_tags = {t.id for t in tags_result.scalars().all()}

        for tag_id in data.tag_ids:
            if tag_id in valid_tags:
                db.add(NoteTag(note_id=note_id, tag_id=tag_id))

    await db.commit()

    result = await db.execute(
        select(Tag)
        .join(NoteTag, NoteTag.tag_id == Tag.id)
        .where(NoteTag.note_id == note_id)
        .order_by(Tag.name)
    )
    tags = result.scalars().all()
    return [TagResponse.model_validate(t) for t in tags]


@router.post("/notes/{note_id}/add/{tag_id}", response_model=list[TagResponse], status_code=201)
async def add_tag_to_note(
    note_id: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TagResponse]:
    note_result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    if note_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Note not found")

    tag_result = await db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id)
    )
    if tag_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Tag not found")

    existing = await db.execute(
        select(NoteTag).where(NoteTag.note_id == note_id, NoteTag.tag_id == tag_id)
    )
    if existing.scalar_one_or_none() is None:
        db.add(NoteTag(note_id=note_id, tag_id=tag_id))
        await db.commit()

    result = await db.execute(
        select(Tag)
        .join(NoteTag, NoteTag.tag_id == Tag.id)
        .where(NoteTag.note_id == note_id)
        .order_by(Tag.name)
    )
    tags = result.scalars().all()
    return [TagResponse.model_validate(t) for t in tags]


@router.delete("/notes/{note_id}/remove/{tag_id}", status_code=204)
async def remove_tag_from_note(
    note_id: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    note_result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    if note_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Note not found")

    result = await db.execute(
        select(NoteTag).where(NoteTag.note_id == note_id, NoteTag.tag_id == tag_id)
    )
    note_tag = result.scalar_one_or_none()
    if note_tag:
        await db.delete(note_tag)
        await db.commit()
