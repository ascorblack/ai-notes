from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Event, User
from app.schemas.event import EventResponse

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventResponse])
async def list_events(
    from_dt: datetime = Query(..., alias="from", description="ISO 8601 start of range"),
    to_dt: datetime = Query(..., alias="to", description="ISO 8601 end of range"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[EventResponse]:
    result = await db.execute(
        select(Event)
        .where(
            Event.user_id == user.id,
            Event.starts_at >= from_dt,
            Event.starts_at <= to_dt,
        )
        .order_by(Event.starts_at)
    )
    events = list(result.scalars().all())
    return [EventResponse.model_validate(e) for e in events]
