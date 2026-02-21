import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
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
    AgentSettingsTestRequest,
    AgentSettingsTestResponse,
    AgentSettingsUpdate,
    ProfileFactItem,
    ProfileFactUpdate,
    ProfileFactsResponse,
)
from app.agent.dispatcher import AgentDispatcher, UnknownIntentError
from app.middleware.rate_limit import agent_limiter
from app.agent.intent_classifier import IntentClassifier, IntentCategory
from app.agent.tools.request_clarification import ClarificationNeeded
from app.services.agent import get_profile_facts, _is_redundant_profile_fact
from app.services.agent_settings_service import get_agent_settings, get_agent_settings_for_api, upsert_agent_settings
from app.services.llm import test_connection
from app.services.pending_actions import pending_actions, PendingAction

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


def _sse_event(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


_dispatcher = AgentDispatcher()


async def _stream_generator(
    db: AsyncSession,
    user: User,
    user_input: str,
    note_id: int | None,
    session_id: str | None = None,
):
    queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()
    error_msg: str | None = None
    current_session_id = session_id or str(uuid.uuid4())

    async def on_event(phase: str, data: dict) -> None:
        await queue.put((phase, data))

    INTENT_LABELS = {
        IntentCategory.NOTE: "Заметка",
        IntentCategory.TASK: "Задача",
        IntentCategory.EVENT: "Событие",
    }

    async def run_agent() -> None:
        nonlocal error_msg
        try:
            pending = await pending_actions.get(user.id, current_session_id)
            if pending:
                pending.context["clarification_response"] = user_input
                await pending_actions.delete(user.id, current_session_id)
                await queue.put(("resuming", {"message": "Продолжаю…"}))
                affected, created, _ = await _dispatcher.process(
                    intent=IntentCategory[pending.context.get("intent", "NOTE")],
                    db=db,
                    user_id=user.id,
                    user_input=user_input,
                    note_id=note_id,
                    on_event=on_event,
                )
                await queue.put(("done", {"affected_ids": affected, "created_ids": created, "created_note_ids": created}))
                return

            await queue.put(("classifying_intent", {"message": "Определяю тип запроса…"}))
            intent = await IntentClassifier.classify_intent(db, user.id, user_input)
            if intent == IntentCategory.UNKNOWN:
                await queue.put(("done", {"unknown_intent": True, "affected_ids": [], "created_ids": [], "created_note_ids": []}))
                return
            await queue.put(("intent_detected", {"intent": intent.value, "intent_label": INTENT_LABELS.get(intent, intent.value)}))
            await _dispatcher.process(
                intent=intent,
                db=db,
                user_id=user.id,
                user_input=user_input,
                note_id=note_id,
                on_event=on_event,
            )
        except ClarificationNeeded as e:
            await pending_actions.set(
                user.id,
                current_session_id,
                PendingAction(
                    tool=e.tool,
                    params=e.params,
                    awaiting="clarification",
                    context={"original_input": user_input, "intent": INTENT_LABELS.get(IntentCategory.NOTE, "NOTE"), **e.context},
                ),
            )
            await queue.put((
                "clarification_request",
                {
                    "question": e.question,
                    "session_id": current_session_id,
                },
            ))
        except UnknownIntentError as e:
            await queue.put(("done", {"unknown_intent": True, "affected_ids": [], "created_ids": [], "created_note_ids": [], "reason": str(e)}))
        except Exception as e:
            logger.error(
                "Agent process failed",
                extra={"user_id": user.id, "error": str(e), "error_type": type(e).__name__},
                exc_info=True,
            )
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
            elif phase == "clarification_request":
                chunk = _sse_event("clarification_request", data)
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


@router.post("/settings/test", response_model=AgentSettingsTestResponse)
async def test_settings(
    data: AgentSettingsTestRequest,
    agent: str = "notes",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AgentSettingsTestResponse:
    if agent not in ("notes", "chat"):
        raise HTTPException(status_code=400, detail="agent must be 'notes' or 'chat'")
    stored = await get_agent_settings(db, user.id, agent)
    base_url = (data.base_url or "").strip() or stored["base_url"]
    model = (data.model or "").strip() or stored["model"]
    api_key: str | None = data.api_key
    if api_key is not None and api_key.strip() == "":
        api_key = None
    if api_key is None:
        api_key = stored.get("api_key") or None
        if api_key is not None and api_key.strip() == "":
            api_key = None
    if not base_url or not model:
        return AgentSettingsTestResponse(ok=False, error_type="other", message="Укажите Base URL и модель")
    ok, err_msg = await test_connection(base_url=base_url, model=model, api_key=api_key)
    if ok:
        return AgentSettingsTestResponse(ok=True)
    error_type = "other"
    if err_msg and "API ключ" in err_msg:
        error_type = "invalid_api_key"
    elif err_msg and ("недоступен" in err_msg or "Сервер" in err_msg):
        error_type = "connection"
    return AgentSettingsTestResponse(ok=False, error_type=error_type, message=err_msg)


@router.post("/profile", response_model=ProfileFactItem, status_code=status.HTTP_201_CREATED)
async def create_profile_fact(
    data: ProfileFactUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileFactItem:
    fact_text = data.fact.strip()
    if not fact_text:
        raise HTTPException(status_code=400, detail="Fact cannot be empty")
    existing_rows = await db.execute(
        select(UserProfileFact.fact).where(UserProfileFact.user_id == user.id)
    )
    existing_facts = [r[0] for r in existing_rows.all()]
    existing_normalized = {r.strip().lower() for r in existing_facts}
    if fact_text.lower() in existing_normalized:
        raise HTTPException(status_code=409, detail="Такой факт уже есть")
    if _is_redundant_profile_fact(fact_text, existing_facts):
        raise HTTPException(
            status_code=409,
            detail="Папка для этой сферы уже указана в другой записи",
        )
    row = UserProfileFact(user_id=user.id, fact=fact_text)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ProfileFactItem(id=row.id, fact=row.fact)


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
@agent_limiter
async def agent_process(
    request: Request,
    data: AgentProcessRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AgentProcessResponse:
    intent = await IntentClassifier.classify_intent(db, user.id, data.user_input)
    if intent == IntentCategory.UNKNOWN:
        return AgentProcessResponse(
            affected_ids=[],
            created_ids=[],
            unknown_intent=True,
            reason="Не понял запрос. Попробуйте переформулировать.",
        )
    try:
        affected_ids, created_ids, skipped_reason = await _dispatcher.process(
            intent=intent,
            db=db,
            user_id=user.id,
            user_input=data.user_input,
            note_id=data.note_id,
        )
    except UnknownIntentError as e:
        return AgentProcessResponse(
            affected_ids=[],
            created_ids=[],
            unknown_intent=True,
            reason=str(e),
        )
    return AgentProcessResponse(
        affected_ids=affected_ids,
        created_ids=created_ids,
        skipped=skipped_reason is not None,
        reason=skipped_reason,
    )


@router.post("/process/stream")
@agent_limiter
async def agent_process_stream(
    request: Request,
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
