"""Chat agent: DB persistence + ChatExecutor streaming."""

import logging
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent import ChatExecutor
from app.agent.base_executor import build_system_prompt
from app.models import ChatMessage, ChatSession, User
from app.services.agent_settings_service import get_agent_settings

logger = logging.getLogger(__name__)

MAX_CONTEXT_CHARS = 24_000


def _build_messages_from_history(
    history: list[ChatMessage],
    current_user_content: str,
) -> list[dict[str, Any]]:
    """Build OpenAI messages from history, sliding window by char count."""
    result: list[dict[str, Any]] = []
    total = 0
    for m in reversed(history):
        content = (m.content or "").strip()
        msg_len = len(content) + 50
        if total + msg_len > MAX_CONTEXT_CHARS:
            break
        total += msg_len
        if m.role == "tool":
            continue
        entry: dict[str, Any] = {"role": m.role, "content": content or "(пусто)"}
        result.insert(0, entry)
    result.append({"role": "user", "content": current_user_content})
    return result


async def stream_chat_response(
    db: AsyncSession,
    user: User,
    session_id: int,
    user_content: str,
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream chat response. Uses ChatExecutor for turn logic."""
    logger.info(
        "chat: stream_chat_response start",
        extra={"session_id": session_id, "user_id": user.id, "user_content_preview": user_content[:100]},
    )
    session = (
        await db.execute(
            select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
        )
    ).scalar_one_or_none()
    if not session:
        yield {"type": "error", "message": "Session not found"}
        return

    session.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    user_msg = ChatMessage(session_id=session_id, role="user", content=user_content)
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    msg_result = await db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at)
    )
    all_messages = list(msg_result.scalars().all())
    history = all_messages[:-1] if all_messages and all_messages[-1].id == user_msg.id else all_messages

    agent_params = await get_agent_settings(db, user.id, "chat")
    history_openai = _build_messages_from_history(history, user_content)
    from app.agent.chat_executor import SYSTEM_PROMPT_TEMPLATE, _get_tools_for_prompt

    system_prompt = build_system_prompt(
        SYSTEM_PROMPT_TEMPLATE,
        _get_tools_for_prompt(),
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
    )
    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}, *history_openai]
    logger.info(
        "chat: messages built",
        extra={"history_count": len(history), "openai_msg_count": len(messages), "model": agent_params.get("model")},
    )

    executor = ChatExecutor()
    full_content = ""
    tool_calls_saved: list[dict[str, Any]] | None = None

    async for event in executor.execute_turn(
        messages=messages,
        agent_params=agent_params,
        user_id=user.id,
        user_content=user_content,
        max_iterations=10,
    ):
        ev_type = event.get("type")
        if ev_type == "_internal_final":
            full_content = event.get("content", "")
            tool_calls_saved = event.get("tool_calls_saved")
            break
        yield event

    session.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if (session.title or "Новый диалог") == "Новый диалог" and user_content:
        session.title = (user_content.strip()[:50] + ("…" if len(user_content) > 50 else "")) or "Новый диалог"
    assistant_msg = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=full_content,
        tool_calls=tool_calls_saved,
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    logger.info(
        "chat: done",
        extra={
            "message_id": assistant_msg.id,
            "content_length": len(full_content),
            "results_in_turn": len(tool_calls_saved) if tool_calls_saved else 0,
        },
    )
    yield {"type": "done", "message_id": assistant_msg.id, "content": full_content}


async def stream_chat_response_regenerate(
    db: AsyncSession,
    user: User,
    session_id: int,
    assistant_message_id: int,
) -> AsyncGenerator[dict[str, Any], None]:
    """Regenerate assistant response."""
    session = (
        await db.execute(
            select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
        )
    ).scalar_one_or_none()
    if not session:
        yield {"type": "error", "message": "Session not found"}
        return

    msg_result = await db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at)
    )
    all_msgs = list(msg_result.scalars().all())
    target_idx = next(
        (i for i, m in enumerate(all_msgs) if m.id == assistant_message_id and m.role == "assistant"),
        None,
    )
    if target_idx is None:
        yield {"type": "error", "message": "Message not found"}
        return

    prev_user = next((all_msgs[i] for i in range(target_idx - 1, -1, -1) if all_msgs[i].role == "user"), None)
    if not prev_user:
        yield {"type": "error", "message": "No user message to regenerate from"}
        return

    for m in all_msgs[target_idx:]:
        await db.delete(m)
    await db.commit()

    session.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    history = all_msgs[:target_idx]
    agent_params = await get_agent_settings(db, user.id, "chat")
    history_openai = _build_messages_from_history(history, prev_user.content or "")
    from app.agent.chat_executor import SYSTEM_PROMPT_TEMPLATE, _get_tools_for_prompt

    system_prompt = build_system_prompt(
        SYSTEM_PROMPT_TEMPLATE,
        _get_tools_for_prompt(),
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
    )
    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}, *history_openai]

    executor = ChatExecutor()
    full_content = ""
    tool_calls_saved: list[dict[str, Any]] | None = None

    async for event in executor.execute_turn(
        messages=messages,
        agent_params=agent_params,
        user_id=user.id,
        user_content=prev_user.content or "",
        max_iterations=10,
    ):
        ev_type = event.get("type")
        if ev_type == "_internal_final":
            full_content = event.get("content", "")
            tool_calls_saved = event.get("tool_calls_saved")
            break
        yield event

    session.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    assistant_msg = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=full_content,
        tool_calls=tool_calls_saved,
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    logger.info(
        "chat: done (regenerate)",
        extra={"message_id": assistant_msg.id, "content_length": len(full_content)},
    )
    yield {"type": "done", "message_id": assistant_msg.id, "content": full_content}
