"""Telegram bot integration for capture anywhere."""

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, UserProfileFact
from app.services import agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.get("/webhook/info")
async def get_webhook_info(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    result = await db.execute(
        select(User).where(User.email.contains("@telegram"), User.email.endswith(".bot"))
    )
    bot_user = result.scalar_one_or_none()
    return {
        "webhook_url": f"https://{Request.base_url.hostname}/telegram/webhook/{user.id}",
        "bot_user_exists": bot_user is not None,
    }
