import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import ChatMessage, ChatSession, User
from app.schemas.chat import ChatMessageRequest, ChatSessionPatch, RegenerateRequest
from app.services.chat_agent import stream_chat_response, stream_chat_response_regenerate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


def _sse_event(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List chat sessions for user."""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    sessions = list(result.scalars().all())
    return [{"id": s.id, "title": s.title or "Новый диалог", "created_at": s.created_at.isoformat(), "updated_at": s.updated_at.isoformat()} for s in sessions]


@router.post("/sessions")
async def create_session(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new chat session."""
    session = ChatSession(user_id=user.id, title="Новый диалог")
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {"id": session.id, "title": session.title, "created_at": session.created_at.isoformat(), "updated_at": session.updated_at.isoformat()}


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get session with messages."""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    msg_result = await db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at)
    )
    messages = list(msg_result.scalars().all())

    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at.isoformat(),
        "updated_at": session.updated_at.isoformat(),
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "tool_calls": m.tool_calls,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


@router.patch("/sessions/{session_id}")
async def patch_session(
    session_id: int,
    data: ChatSessionPatch,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update session (e.g. title)."""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if data.title is not None:
        session.title = data.title.strip() or "Новый диалог"
    await db.commit()
    await db.refresh(session)
    return {"id": session.id, "title": session.title, "created_at": session.created_at.isoformat(), "updated_at": session.updated_at.isoformat()}


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a chat session."""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"ok": True}


@router.delete("/sessions/{session_id}/messages/{message_id}")
async def delete_message(
    session_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a message from a session."""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    msg_result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.id == message_id,
            ChatMessage.session_id == session_id,
        )
    )
    msg = msg_result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    await db.delete(msg)
    await db.commit()
    return {"ok": True}


@router.post("/sessions/{session_id}/regenerate")
async def regenerate_message(
    session_id: int,
    data: RegenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Regenerate assistant response for the given message."""
    async def gen():
        try:
            async for event in stream_chat_response_regenerate(db, user, session_id, data.message_id):
                ev_type = event.get("type")
                if ev_type == "content_delta":
                    yield _sse_event("content_delta", {"delta": event.get("delta", "")})
                elif ev_type == "tool_call":
                    yield _sse_event("tool_call", {
                        "id": event.get("id"),
                        "name": event.get("name"),
                        "arguments": event.get("arguments"),
                    })
                elif ev_type == "tool_result":
                    yield _sse_event("tool_result", {"id": event.get("id"), "results": event.get("results", [])})
                elif ev_type == "done":
                    yield _sse_event("done", {"message_id": event.get("message_id"), "content": event.get("content", "")})
                elif ev_type == "error":
                    yield _sse_event("error", {"message": event.get("message", "")})
        except Exception as e:
            logger.error("Regenerate stream failed", extra={"session_id": session_id, "error": str(e)})
            yield _sse_event("error", {"message": str(e)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sessions/{session_id}/message")
async def send_message(
    session_id: int,
    data: ChatMessageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send message and stream response."""
    content = (data.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required")

    async def gen():
        try:
            async for event in stream_chat_response(db, user, session_id, content):
                ev_type = event.get("type")
                if ev_type == "content_delta":
                    yield _sse_event("content_delta", {"delta": event.get("delta", "")})
                elif ev_type == "tool_call":
                    yield _sse_event("tool_call", {
                        "id": event.get("id"),
                        "name": event.get("name"),
                        "arguments": event.get("arguments"),
                    })
                elif ev_type == "tool_result":
                    yield _sse_event("tool_result", {"id": event.get("id"), "results": event.get("results", [])})
                elif ev_type == "done":
                    yield _sse_event("done", {"message_id": event.get("message_id"), "content": event.get("content", "")})
                elif ev_type == "error":
                    yield _sse_event("error", {"message": event.get("message", "")})
        except Exception as e:
            logger.error("Chat stream failed", extra={"session_id": session_id, "error": str(e)})
            yield _sse_event("error", {"message": str(e)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
