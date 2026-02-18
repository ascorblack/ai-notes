import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import status
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, UserProfileFact
from app.schemas.agent import (
    AgentProcessRequest,
    AgentProcessResponse,
    AgentSettingsResponse,
    AgentSettingsUpdate,
    ProfileFactItem,
    ProfileFactUpdate,
    ProfileFactsResponse,
)
from app.services.agent import get_profile_facts, process_agent
from app.services.agent_settings_service import get_agent_settings_for_api, upsert_agent_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


def _sse_event(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


async def _stream_generator(
    db: AsyncSession,
    user: User,
    user_input: str,
    note_id: int | None,
):
    queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()
    error_msg: str | None = None

    async def on_event(phase: str, data: dict) -> None:
        await queue.put((phase, data))

    async def run_agent() -> None:
        nonlocal error_msg
        try:
            await process_agent(db, user, user_input, note_id=note_id, on_event=on_event)
        except Exception as e:
            logger.error("Agent process failed", extra={"user_id": user.id, "error": str(e)})
            error_msg = str(e)
        finally:
            await queue.put(("_end", {}))

    task = asyncio.create_task(run_agent())

    try:
        while True:
            phase, data = await queue.get()
            if phase == "_end":
                break
            if phase == "done":
                chunk = _sse_event("done", data)
            else:
                chunk = _sse_event("status", {"phase": phase, **data})
            yield chunk
            await asyncio.sleep(0)
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    if error_msg:
        yield _sse_event("error", {"message": error_msg})
        await asyncio.sleep(0)


@router.get("/settings", response_model=AgentSettingsResponse)
async def get_settings(
    agent: str = "notes",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AgentSettingsResponse:
    if agent not in ("notes", "chat"):
        raise HTTPException(status_code=400, detail="agent must be 'notes' or 'chat'")
    s = await get_agent_settings_for_api(db, user.id, agent)
    return AgentSettingsResponse(**s)


@router.patch("/settings", response_model=AgentSettingsResponse)
async def patch_settings(
    data: AgentSettingsUpdate,
    agent: str = "notes",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AgentSettingsResponse:
    if agent not in ("notes", "chat"):
        raise HTTPException(status_code=400, detail="agent must be 'notes' or 'chat'")
    row = await upsert_agent_settings(
        db,
        user.id,
        agent,
        base_url=data.base_url,
        model=data.model,
        api_key=data.api_key,
        temperature=data.temperature,
        frequency_penalty=data.frequency_penalty,
        top_p=data.top_p,
        max_tokens=data.max_tokens,
    )
    await db.commit()
    s = await get_agent_settings_for_api(db, user.id, agent)
    return AgentSettingsResponse(**s)


@router.get("/profile", response_model=ProfileFactsResponse)
async def get_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileFactsResponse:
    rows = await get_profile_facts(db, user.id)
    facts = [ProfileFactItem(id=fid, fact=f) for fid, f in rows]
    return ProfileFactsResponse(facts=facts)


@router.patch("/profile/{fact_id}", response_model=ProfileFactItem)
async def update_profile_fact(
    fact_id: int,
    data: ProfileFactUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileFactItem:
    result = await db.execute(
        select(UserProfileFact).where(
            UserProfileFact.id == fact_id,
            UserProfileFact.user_id == user.id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Fact not found")
    fact_text = data.fact.strip()
    if not fact_text:
        raise HTTPException(status_code=400, detail="Fact cannot be empty")
    row.fact = fact_text
    await db.commit()
    await db.refresh(row)
    return ProfileFactItem(id=row.id, fact=row.fact)


@router.delete("/profile/{fact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile_fact(
    fact_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(
        select(UserProfileFact).where(
            UserProfileFact.id == fact_id,
            UserProfileFact.user_id == user.id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Fact not found")
    await db.delete(row)
    await db.commit()


@router.post("/process", response_model=AgentProcessResponse)
async def agent_process(
    data: AgentProcessRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AgentProcessResponse:
    affected_ids, created_ids, skipped_reason = await process_agent(db, user, data.user_input, note_id=data.note_id)
    return AgentProcessResponse(
        affected_ids=affected_ids,
        created_ids=created_ids,
        skipped=skipped_reason is not None,
        reason=skipped_reason,
    )


@router.post("/process/stream")
async def agent_process_stream(
    data: AgentProcessRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return StreamingResponse(
        _stream_generator(db, user, data.user_input, data.note_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
