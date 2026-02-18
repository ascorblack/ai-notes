"""Base executor: _execute_tool, _try_parse_text_tool_call, build_system_prompt."""

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from json import JSONDecodeError
from typing import Any

from pydantic import ValidationError

from app.agent.tools.tool_def import ToolDefinition

logger = logging.getLogger(__name__)


def build_system_prompt(template: str, tools_section: str, current_time: str) -> str:
    """Build system prompt. Tools passed via API; tools_section for prompt if template has {tools}."""
    base = template.replace("{current_time}", current_time).replace("{tools}", tools_section)
    if "{tools}" not in template and tools_section:
        base = f"{base}\n\n{tools_section}"
    year = current_time.split("-")[0] if "-" in current_time else current_time[:4]
    reminder = (
        f"Текущая дата: {current_time} (год {year}). "
        "Отвечай на том же языке, на котором пишет пользователь."
    )
    if "текущая дата" not in base.lower():
        base = f"{base}\n\n{reminder}"
    return base


def _get_api_error_detail(exc: Exception) -> str:
    """Extract error detail from API exception."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict) and "detail" in body:
        return str(body["detail"])
    return f"{type(exc).__name__}: {exc}"


class BaseChatExecutor(ABC):
    """Base for chat executors. Provides _execute_tool, _try_parse_text_tool_call."""

    _executor_name: str = "BaseChat"
    _TOOL_CALL_RENDER_DELAY_SEC = 0.03

    def __init__(self, tools: dict[str, ToolDefinition], max_tool_output_chars: int = 8000):
        self._tools = tools
        self._max_tool_output_chars = max_tool_output_chars

    def _try_parse_text_tool_call(self, content: str) -> dict | None:
        """Detect tool call as plain JSON in text (model bypassed function_call)."""
        if not content or not content.strip():
            return None
        stripped = content.strip()
        for tag in ("tool_call", "function-call", "tool_response"):
            open_tag = f"<{tag}>"
            close_tag = f"</{tag}>"
            if open_tag in stripped and close_tag in stripped:
                start = stripped.find(open_tag) + len(open_tag)
                end = stripped.find(close_tag, start)
                if end != -1:
                    stripped = stripped[start:end].strip()
                break
        if stripped.startswith("```"):
            lines = stripped.split("\n")
            if lines and lines[0].startswith("```"):
                end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
                stripped = "\n".join(lines[1:end])
        if not (stripped.startswith("{") and stripped.endswith("}")):
            return None
        try:
            obj = json.loads(stripped)
        except JSONDecodeError:
            return None
        if not isinstance(obj, dict) or "name" not in obj:
            return None
        name = obj.get("name")
        if not isinstance(name, str) or not name:
            return None
        if self._tools.get(name) is None:
            return None
        arguments = obj.get("arguments")
        if isinstance(arguments, dict):
            raw_args = json.dumps(arguments, ensure_ascii=False)
        elif isinstance(arguments, str):
            raw_args = arguments
        else:
            raw_args = "{}"
        return {"name": name, "arguments": raw_args, "call_id": f"fallback_{name}"}

    async def _execute_tool(
        self,
        tool_name: str,
        raw_args: str,
        tool_call_id: str,
        extra_context: dict[str, Any] | None = None,
    ) -> str:
        """Execute tool with validation and timeout. Returns result string."""
        tool_def = self._tools.get(tool_name)
        if tool_def is None:
            return f"Error: tool '{tool_name}' not found"

        try:
            args_dict = json.loads(raw_args) if raw_args.strip() else {}
        except JSONDecodeError as exc:
            return f"Error: invalid JSON arguments for tool '{tool_name}': {exc}"

        try:
            validated = tool_def.validate_args(args_dict)
        except ValidationError as exc:
            return f"Error: tool '{tool_name}' validation error: {exc}"

        timeout = tool_def.timeout_seconds
        if timeout <= 0:
            raise ValueError(f"Tool '{tool_name}' has invalid timeout_seconds={timeout}")

        kwargs = dict(validated.model_dump())
        if extra_context:
            kwargs.update(extra_context)

        try:
            result = await asyncio.wait_for(
                tool_def.instance.call(**kwargs),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            return f"Error: tool '{tool_name}' timed out after {timeout}s"
        except TypeError as exc:
            return f"Error: tool '{tool_name}' argument error: {exc}"
        except Exception as exc:
            logger.error(
                "tool execution failed",
                extra={"tool": tool_name, "call_id": tool_call_id, "error": str(exc)},
                exc_info=True,
            )
            return f"Error executing {tool_name}: {_get_api_error_detail(exc)}"

        if not isinstance(result, str):
            raise TypeError(f"Tool '{tool_name}' returned non-string: {type(result).__name__}")
        if len(result) > self._max_tool_output_chars:
            head = result[: int(self._max_tool_output_chars * 0.7)]
            tail = result[-int(self._max_tool_output_chars * 0.2) :]
            return f"{head}\n\n... [TRIMMED {len(result)} chars] ...\n\n{tail}"
        return result

    @abstractmethod
    async def execute_turn(self, **kwargs) -> Any:
        """Run agent turn. Subclass implements."""
        raise NotImplementedError
