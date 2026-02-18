"""Intent classifier for main page requests. Categories: note, task, event, unknown."""

import json
import logging
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

from app.services.agent_settings_service import get_agent_settings
from app.services.llm import chat_completion

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты — классификатор намерений пользователя. Вызови тул classify_intent с правильной категорией.

Категории (параметр intent):

- event: напоминание, календарь, встреча, событие, "завтра в", "на дату", "в пятницу", любая привязка к дате/времени
- task: список дел, пункты для выполнения, "первое... второе... третье", "нужно сделать X, Y, Z", задача, выполнить, не забудь — БЕЗ даты/времени. Список действий (пронумерованный или нет) = task, даже если в начале написано "создать заметку"
- note: один сплошной текст для сохранения — описание, идея, мысль, выписка — БЕЗ списка пунктов для выполнения
- unknown: нерелевантный ввод, нечитаемый текст, бессмыслица, нельзя определить

Правила:
1. При наличии даты/времени → всегда event
2. "Задача на завтра" → event (есть дата)
3. Список пунктов (Первое... Второе... / 1. 2. 3.) что нужно сделать → task
4. "Создать заметку" + список дел → task (содержимое важнее формулировки)
5. Бессмысленный набор символов, приветствие без контента → unknown"""


class IntentCategory(str, Enum):
    NOTE = "note"
    TASK = "task"
    EVENT = "event"
    UNKNOWN = "unknown"


class ClassifyIntentParams(BaseModel):
    """Tool params for intent classification."""

    intent: Literal["note", "task", "event", "unknown"] = Field(
        ...,
        description="Категория запроса: note, task, event или unknown",
    )


CLASSIFY_INTENT_TOOL = {
    "type": "function",
    "function": {
        "name": "classify_intent",
        "description": "Классифицировать намерение пользователя. Вызови с одним из: note, task, event, unknown.",
        "parameters": ClassifyIntentParams.model_json_schema(),
    },
}


class IntentClassifier:
    """Classifies user requests for main page. Categories: note, task, event, unknown."""

    @staticmethod
    async def classify_intent(
        db,
        user_id: int,
        user_input: str,
        user_context: str = "",
    ) -> IntentCategory:
        """Classify user request intent. Uses tool call with enum. Used only for main page (/agent/process)."""
        if not user_input or not user_input.strip():
            return IntentCategory.UNKNOWN

        agent_params = await get_agent_settings(db, user_id, "notes")
        prompt = user_input
        if user_context:
            prompt = f"Контекст: {user_context}\n\nЗапрос: {user_input}"

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        logger.info(
            "intent_classifier: calling LLM",
            extra={"user_id": user_id, "prompt_length": len(prompt), "prompt_preview": prompt[:100]},
        )
        response = await chat_completion(
            messages,
            tools=[CLASSIFY_INTENT_TOOL],
            tool_choice={"type": "function", "function": {"name": "classify_intent"}},
            base_url=agent_params.get("base_url"),
            model=agent_params.get("model"),
            api_key=agent_params.get("api_key") or None,
            temperature=0.0,
            frequency_penalty=agent_params.get("frequency_penalty", 0),
            top_p=agent_params.get("top_p", 1.0),
            max_tokens=8096,
        )

        message = response.get("message", response)
        if not isinstance(message, dict):
            logger.warning("intent_classifier: message is not dict", extra={"response": str(response)[:200]})
            return IntentCategory.UNKNOWN

        tool_calls = message.get("tool_calls", [])
        if not tool_calls:
            logger.warning("intent_classifier: no tool_calls in response", extra={"message_keys": list(message.keys())})
            return IntentCategory.UNKNOWN

        tc = tool_calls[0]
        fn = tc.get("function", {})
        name = fn.get("name", "")
        if name != "classify_intent":
            logger.warning("intent_classifier: unexpected tool", extra={"name": name})
            return IntentCategory.UNKNOWN

        args_str = fn.get("arguments", "{}")
        try:
            args = json.loads(args_str) if isinstance(args_str, str) else args_str
        except json.JSONDecodeError as e:
            logger.warning("intent_classifier: invalid json args", extra={"args": args_str[:100], "error": str(e)})
            return IntentCategory.UNKNOWN

        parsed = ClassifyIntentParams.model_validate(args)
        try:
            return IntentCategory(parsed.intent)
        except ValueError:
            logger.warning("intent_classifier: invalid intent value", extra={"intent": parsed.intent})
            return IntentCategory.UNKNOWN
