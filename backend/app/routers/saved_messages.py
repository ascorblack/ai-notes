from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import SavedMessage, SavedMessageCategory, User
from app.schemas.saved_message import (
    SavedMessageCreate,
    SavedMessageResponse,
    SavedMessageCategoryCreate,
    SavedMessageCategoryResponse,
    SavedMessageCategoryUpdate,
    SavedMessageTrashItem,
)
from app.services.saved_message_categories import categorize_message, get_or_create_categories

router = APIRouter(prefix="/saved-messages", tags=["saved-messages"])


# === Categories ===

@router.get("/categories", response_model=list[SavedMessageCategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedMessageCategoryResponse]:
    result = await db.execute(
        select(SavedMessageCategory).where(SavedMessageCategory.user_id == user.id).order_by(SavedMessageCategory.name)
    )
    categories = result.scalars().all()
    return [SavedMessageCategoryResponse.model_validate(c) for c in categories]


@router.post("/categories", response_model=SavedMessageCategoryResponse, status_code=201)
async def create_category(
    data: SavedMessageCategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavedMessageCategoryResponse:
    existing = await db.execute(
        select(SavedMessageCategory).where(
            SavedMessageCategory.user_id == user.id,
            SavedMessageCategory.name == data.name
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Category already exists")

    category = SavedMessageCategory(user_id=user.id, name=data.name)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return SavedMessageCategoryResponse.model_validate(category)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(
        select(SavedMessageCategory).where(
            SavedMessageCategory.id == category_id,
            SavedMessageCategory.user_id == user.id
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    # Unassign messages from this category
    await db.execute(
        delete(SavedMessage).where(SavedMessage.category_id == category_id)
    )
    await db.delete(category)
    await db.commit()


# === Messages ===

@router.get("", response_model=list[SavedMessageResponse])
async def list_messages(
    category_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedMessageResponse]:
    query = select(SavedMessage).where(
        SavedMessage.user_id == user.id,
        SavedMessage.deleted_at.is_(None),
    )

    if category_id is not None:
        # Verify category belongs to user
        cat_result = await db.execute(
            select(SavedMessageCategory).where(
                SavedMessageCategory.id == category_id,
                SavedMessageCategory.user_id == user.id
            )
        )
        if cat_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Category not found")
        query = query.where(SavedMessage.category_id == category_id)

    query = query.order_by(SavedMessage.created_at.asc())  # OLD FIRST (bottom in messenger)

    result = await db.execute(query)
    messages = result.scalars().all()
    return [SavedMessageResponse.model_validate(m) for m in messages]


@router.post("", response_model=SavedMessageResponse, status_code=201)
async def create_message(
    data: SavedMessageCreate,
    auto_categorize: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavedMessageResponse:
    category = None

    if auto_categorize:
        category, _ = await categorize_message(db, user.id, data.content)
    elif data.category_id is not None:
        cat_result = await db.execute(
            select(SavedMessageCategory).where(
                SavedMessageCategory.id == data.category_id,
                SavedMessageCategory.user_id == user.id
            )
        )
        category = cat_result.scalar_one_or_none()
        if category is None:
            raise HTTPException(status_code=400, detail="Category not found")

    message = SavedMessage(
        user_id=user.id,
        category_id=category.id if category else None,
        content=data.content,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return SavedMessageResponse.model_validate(message)


@router.delete("/{message_id}", status_code=204)
async def delete_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(
        select(SavedMessage).where(
            SavedMessage.id == message_id,
            SavedMessage.user_id == user.id,
            SavedMessage.deleted_at.is_(None),
        )
    )
    message = result.scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")

    message.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()


# === Trash ===

@router.get("/trash", response_model=list[SavedMessageTrashItem])
async def list_trash(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedMessageTrashItem]:
    result = await db.execute(
        select(SavedMessage)
        .where(SavedMessage.user_id == user.id, SavedMessage.deleted_at.isnot(None))
        .order_by(SavedMessage.deleted_at.desc())
    )
    messages = result.scalars().all()
    return [
        SavedMessageTrashItem(
            id=m.id,
            content=m.content,
            category_id=m.category_id,
            deleted_at=m.deleted_at
        )
        for m in messages
    ]


@router.post("/trash/{message_id}/restore", status_code=204)
async def restore_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(
        select(SavedMessage).where(
            SavedMessage.id == message_id,
            SavedMessage.user_id == user.id,
            SavedMessage.deleted_at.isnot(None),
        )
    )
    message = result.scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found in trash")
    if message.deleted_at is None:
        raise HTTPException(status_code=400, detail="Message is not in trash")

    message.deleted_at = None
    await db.commit()


@router.delete("/trash/{message_id}", status_code=204)
async def permanent_delete_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(
        select(SavedMessage).where(
            SavedMessage.id == message_id,
            SavedMessage.user_id == user.id,
            SavedMessage.deleted_at.isnot(None),
        )
    )
    message = result.scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")

    await db.delete(message)
    await db.commit()


# === Search ===

@router.get("/search", response_model=list[SavedMessageResponse])
async def search_messages(
    q: str,
    category_id: int | None = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedMessageResponse]:
    if not q or len(q.strip()) < 1:
        return []

    search_pattern = f"%{q.strip()}%"
    query = select(SavedMessage).where(
        SavedMessage.user_id == user.id,
        SavedMessage.deleted_at.is_(None),
        SavedMessage.content.ilike(search_pattern),
    )

    if category_id is not None:
        query = query.where(SavedMessage.category_id == category_id)

    query = query.order_by(SavedMessage.created_at.desc()).limit(limit)

    result = await db.execute(query)
    messages = result.scalars().all()
    return [SavedMessageResponse.model_validate(m) for m in messages]
