"""Event executor: create calendar events. Tools: create_note_with_event, update_user_profile."""

import json
import logging
from typing import Any

from app.agent.base_executor import BaseChatExecutor
from app.agent.tools.event_tool_def import CREATE_NOTE_WITH_EVENT_TOOL_DEF
from app.agent.tools.notes_tool_def import UPDATE_USER_PROFILE_TOOL_DEF
from app.services.agent import build_context
from app.services.agent_settings_service import get_agent_settings
from app.services.llm import chat_completion

logger = logging.getLogger(__name__)

TOOL_DISPLAY: dict[str, str] = {
    "create_note_with_event": "Создаю событие в календаре",
    "update_user_profile": "Обновляю профиль",
}

TOOLS = {
    "create_note_with_event": CREATE_NOTE_WITH_EVENT_TOOL_DEF,
    "update_user_profile": UPDATE_USER_PROFILE_TOOL_DEF,
}

SYSTEM_PROMPT = """Ты — агент событий календаря. Пользователь просит напоминание, встречу, добавить в календарь.

Твоя задача: извлечь дату/время, оформить заметку + событие. starts_at/ends_at в ISO 8601.
Дефолты: 09:00 для «только дата», 30 мин длительность если не указано.

Шаблон content: ## Событие (что, когда, где) | ## Заметка пользователя | ## Детали

ВАЖНО: Только для запросов С датой/временем. Без даты — не обрабатывай.

После create_note_with_event — ОБЯЗАТЕЛЬНО проверь: есть ли в запросе сфера/контекст (работа, встреча, проект). Если да и её нет в «Известно о пользователе» — вызови update_user_profile.
Отвечай ТОЛЬКО вызовами create_note_with_event (и update_user_profile)."""


class EventExecutor(BaseChatExecutor):
    """Executor for calendar events only."""

    _executor_name = "EventExecutor"

    def __init__(self, max_tool_output_chars: int = 8000):
        super().__init__(tools=TOOLS, max_tool_output_chars=max_tool_output_chars)

    async def execute_turn(
        self,
        db: Any,
        user_id: int,
        user_input: str,
        note_id: int | None = None,
        agent_params: dict[str, Any] | None = None,
        on_event: Any = None,
    ) -> tuple[list[int], list[int], str | None]:
        """Execute one turn. Returns (affected_ids, created_ids, skipped_reason)."""
        async def emit(phase: str, **data: Any) -> None:
            if on_event:
                await on_event(phase, data)

        await emit("building_context", message="Загрузка контекста…")
        context, profile_block = await build_context(db, user_id, note_id=note_id)

        from datetime import datetime, timezone
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d, %A")
        system_content = SYSTEM_PROMPT + f"\n\nСегодня: {today_str}" + profile_block

        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": f"Контекст:\n{context}\n\nЗапрос события:\n{user_input}"},
        ]

        affected_ids: list[int] = []
        created_ids: list[int] = []

        if agent_params is None:
            agent_params = await get_agent_settings(db, user_id, "notes")

        tool_defs = [CREATE_NOTE_WITH_EVENT_TOOL_DEF, UPDATE_USER_PROFILE_TOOL_DEF]
        openai_tools = [t.to_openai_function() for t in tool_defs]

        await emit("calling_llm", message="Добавляю событие…")
        response = await chat_completion(
            messages,
            tools=openai_tools,
            base_url=agent_params.get("base_url"),
            model=agent_params.get("model"),
            api_key=agent_params.get("api_key") or None,
            temperature=agent_params.get("temperature", 0.7),
            frequency_penalty=agent_params.get("frequency_penalty", 0),
            top_p=agent_params.get("top_p", 1.0),
            max_tokens=agent_params.get("max_tokens", 8096),
        )

        message = response.get("message", response)
        if isinstance(message, dict):
            tool_calls = message.get("tool_calls", [])
        else:
            tool_calls = []

        if not tool_calls:
            await emit("done", affected_ids=affected_ids, created_ids=created_ids, created_note_ids=created_ids)
            return affected_ids, created_ids, None

        for tc in tool_calls:
            fn = tc.get("function", {})
            name = fn.get("name")
            args_str = fn.get("arguments", "{}")
            if name not in TOOLS:
                continue
            try:
                json.loads(args_str)
            except json.JSONDecodeError as e:
                logger.error("EventExecutor: tool args parse error", extra={"name": name, "error": str(e)})
                continue

            await emit("executing_tool", tool=name, message=TOOL_DISPLAY.get(name, name))
            await self._execute_tool(
                tool_name=name,
                raw_args=args_str,
                tool_call_id=f"tc_{name}",
                extra_context={
                    "user_id": user_id,
                    "db": db,
                    "created_ids": created_ids,
                    "affected_ids": affected_ids,
                },
            )

        await emit("saving", message="Сохраняю…")
        await db.commit()
        await emit("done", affected_ids=affected_ids, created_ids=created_ids, created_note_ids=created_ids)
        return affected_ids, created_ids, None
