"""Notes executor: create/edit notes. Tools: create_note, append_to_note, patch_note, request_note_selection, update_user_profile."""

import json
import logging
from typing import Any

from app.agent.base_executor import BaseChatExecutor
from app.agent.tools.notes_tool_def import (
    APPEND_TO_NOTE_TOOL_DEF,
    CREATE_NOTE_TOOL_DEF,
    PATCH_NOTE_TOOL_DEF,
    REQUEST_NOTE_SELECTION_TOOL_DEF,
    UPDATE_USER_PROFILE_TOOL_DEF,
)
from app.services.agent import build_context
from app.services.agent_settings_service import get_agent_settings
from app.services.llm import chat_completion

logger = logging.getLogger(__name__)

TOOL_DISPLAY: dict[str, str] = {
    "create_note": "Создаю заметку",
    "append_to_note": "Добавляю в заметку",
    "patch_note": "Редактирую заметку",
    "request_note_selection": "Уточняю заметку",
    "update_user_profile": "Обновляю профиль",
}

TOOLS = {
    "create_note": CREATE_NOTE_TOOL_DEF,
    "append_to_note": APPEND_TO_NOTE_TOOL_DEF,
    "patch_note": PATCH_NOTE_TOOL_DEF,
    "request_note_selection": REQUEST_NOTE_SELECTION_TOOL_DEF,
    "update_user_profile": UPDATE_USER_PROFILE_TOOL_DEF,
}

SYSTEM_PROMPT = """Ты — агент организации заметок. Пользователь пишет сырые идеи, черновики.

Твоя задача: извлечь суть, переформулировать структурированно в Markdown. НЕ копировать verbatim.

Правила:
1. Если есть блок «Заметка для редактирования» — используй append_to_note или patch_note.
2. Если запрос изменить/дополнить заметку и подходят НЕСКОЛЬКО — request_note_selection с candidates.
3. Иначе — create_note (folder_id или folder_name для новой папки).
4. После создания — update_user_profile при новой сфере.

Шаблон заметки:
## Кратко | ## Основное | ## Ключевые пункты | ## Задачи (опц) | ## Связи (опц)
При append добавляй "\\n\\n---\\n\\n" перед новым блоком.
Отвечай ТОЛЬКО вызовами инструментов."""


class NotesExecutor(BaseChatExecutor):
    """Executor for notes: create, append, patch, request_selection."""

    _executor_name = "NotesExecutor"

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
        system_content = SYSTEM_PROMPT + profile_block

        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": f"Контекст:\n{context}\n\nСырой ввод:\n{user_input}"},
        ]

        affected_ids: list[int] = []
        created_ids: list[int] = []

        if agent_params is None:
            agent_params = await get_agent_settings(db, user_id, "notes")

        tool_defs = [
            CREATE_NOTE_TOOL_DEF,
            APPEND_TO_NOTE_TOOL_DEF,
            PATCH_NOTE_TOOL_DEF,
            REQUEST_NOTE_SELECTION_TOOL_DEF,
            UPDATE_USER_PROFILE_TOOL_DEF,
        ]
        openai_tools = [t.to_openai_function() for t in tool_defs]

        await emit("calling_llm", message="Анализирую…")
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
                args = json.loads(args_str)
            except json.JSONDecodeError as e:
                logger.error("NotesExecutor: tool args parse error", extra={"name": name, "error": str(e)})
                continue

            await emit("executing_tool", tool=name, message=TOOL_DISPLAY.get(name, name))

            if name == "request_note_selection" and note_id is None:
                result = await self._execute_tool(
                    tool_name=name,
                    raw_args=args_str,
                    tool_call_id="req_sel",
                    extra_context={
                        "user_id": user_id,
                        "db": db,
                        "created_ids": created_ids,
                        "affected_ids": affected_ids,
                    },
                )
                try:
                    parsed = json.loads(result)
                    candidates = parsed.get("candidates", [])
                except (json.JSONDecodeError, TypeError):
                    candidates = []
                if candidates:
                    await emit(
                        "done",
                        affected_ids=[],
                        created_ids=[],
                        created_note_ids=[],
                        requires_note_selection=True,
                        candidates=candidates,
                    )
                    return [], [], None
                continue

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
