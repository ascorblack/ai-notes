import logging
import json
from typing import Any, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SavedMessage, SavedMessageCategory, User
from app.services.llm import chat_completion
from app.services.agent_settings_service import get_agent_settings

logger = logging.getLogger(__name__)


DEFAULT_CATEGORIES = [
    "Идеи",
    "Ссылки",
    "Заметки",
    "Покупки",
    "Работа",
    "Личное",
]


async def get_or_create_categories(db: AsyncSession, user_id: int) -> list[SavedMessageCategory]:
    """Get existing categories or create defaults if none exist."""
    result = await db.execute(
        select(SavedMessageCategory).where(SavedMessageCategory.user_id == user_id)
    )
    categories = list(result.scalars().all())

    if not categories:
        for name in DEFAULT_CATEGORIES:
            category = SavedMessageCategory(user_id=user_id, name=name)
            db.add(category)
        await db.commit()
        # Refresh to get IDs
        result = await db.execute(
            select(SavedMessageCategory).where(SavedMessageCategory.user_id == user_id)
        )
        categories = list(result.scalars().all())

    return categories


async def categorize_message(
    db: AsyncSession,
    user_id: int,
    content: str
) -> Tuple[SavedMessageCategory | None, str | None]:
    """
    Use LLM to categorize a saved message.
    Returns (category, error_message).
    """
    categories = await get_or_create_categories(db, user_id)
    category_map = {c.name: c for c in categories}

    category_list = list(category_map.keys())

    try:
        agent_params = await get_agent_settings(db, user_id, "notes")

        messages = [
            {
                "role": "system",
                "content": f"""Ты классификатор сообщений. Тебе нужно отнести сообщение к одной из существующих категорий или предложить новую.

Существующие категории:
{', '.join(category_list)}

Ответь ТОЛЬКО в формате JSON:
{{"category": "Название категории"}}
"""
            },
            {
                "role": "user",
                "content": f"Категоризируй это сообщение: {content[:500]}"
            }
        ]

        choice = await chat_completion(
            messages,
            base_url=agent_params.get("base_url"),
            model=agent_params.get("model"),
            api_key=agent_params.get("api_key") or None,
            temperature=0.2,
        )

        msg = choice.get("message", choice)
        if isinstance(msg, dict):
            result_text = (msg.get("content") or "").strip()
        else:
            result_text = str(msg).strip()

        # Try to parse JSON from response
        try:
            result = json.loads(result_text)
            suggested_category = result.get("category", "").strip()

            # Find exact match
            if suggested_category in category_map:
                return category_map[suggested_category], None

            # Case-insensitive match
            for name, category in category_map.items():
                if name.lower() == suggested_category.lower():
                    return category, None

            # Create new category if suggested
            if suggested_category and len(suggested_category) <= 50:
                new_category = SavedMessageCategory(user_id=user_id, name=suggested_category)
                db.add(new_category)
                await db.commit()
                await db.refresh(new_category)
                return new_category, None

        except json.JSONDecodeError:
            pass

        # Fallback: find first matching category
        for name in category_list:
            if name.lower() in result_text.lower() or result_text.lower() in name.lower():
                return category_map[name], None

        # Default to first category
        return categories[0], None

    except Exception as e:
        logger.error(f"LLM categorization failed: {e}", exc_info=True)
        return categories[0], None
