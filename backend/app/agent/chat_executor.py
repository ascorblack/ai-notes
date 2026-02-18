"""Chat executor: streaming turn with search_notes tool."""

import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any

from app.agent.base_executor import BaseChatExecutor, build_system_prompt
from app.agent.tools.tool_def import (
    GET_NOTES_TREE_TOOL_DEF,
    READ_NOTES_TOOL_DEF,
    SEARCH_NOTES_TOOL_DEF,
    ReadNotesParams,
    SearchNotesParams,
)
from app.services.llm import chat_completion_stream

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_TEMPLATE = """Ты — помощник по обсуждению идей на основе заметок пользователя. У тебя есть доступ к поиску по заметкам.

Когда пользователь задаёт вопрос или хочет обсудить тему:
1. Если спрашивает «что у меня есть», «какие папки», «структура заметок», «обзор» — вызови get_notes_tree.
2. Если уже есть id заметок (из get_notes_tree/search_notes) и нужен полный текст — read_notes с note_ids.
3. Иначе: search_notes с exact_queries и semantic_queries. snippet из search_notes краткий — если нужен полный текст, вызови read_notes.
4. Если поиск ничего не нашёл — честно скажи. Не выдумывай содержимое заметок."""

TOOLS = {
    "search_notes": SEARCH_NOTES_TOOL_DEF,
    "get_notes_tree": GET_NOTES_TREE_TOOL_DEF,
    "read_notes": READ_NOTES_TOOL_DEF,
}


def _get_tools_for_prompt() -> str:
    search_props = SearchNotesParams.model_json_schema().get("properties", {})
    search_params = ", ".join(search_props.keys())
    read_props = ReadNotesParams.model_json_schema().get("properties", {})
    read_params = ", ".join(read_props.keys())
    return (
        f"search_notes - {SEARCH_NOTES_TOOL_DEF.description} ({search_params})\n"
        f"get_notes_tree - {GET_NOTES_TREE_TOOL_DEF.description}\n"
        f"read_notes - {READ_NOTES_TOOL_DEF.description} ({read_params})"
    )


async def _stream_turn(
    executor: "ChatExecutor",
    messages: list[dict[str, Any]],
    agent_params: dict[str, Any],
    user_id: int,
    user_content: str,
    db: Any,
    max_iterations: int = 10,
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream one turn. Yields content_delta, tool_call, tool_result, done."""
    full_content = ""
    tool_calls_saved: list[dict[str, Any]] | None = None
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        logger.info("chat: LLM iteration", extra={"iteration": iteration})
        tool_calls_by_id: dict[str, dict[str, Any]] = {}
        turn_content = ""

        openai_tools = [
            SEARCH_NOTES_TOOL_DEF.to_openai_function(),
            GET_NOTES_TREE_TOOL_DEF.to_openai_function(),
            READ_NOTES_TOOL_DEF.to_openai_function(),
        ]

        async for chunk in chat_completion_stream(
            messages,
            tools=openai_tools,
            base_url=agent_params.get("base_url"),
            model=agent_params.get("model"),
            api_key=agent_params.get("api_key") or None,
            temperature=agent_params["temperature"],
            frequency_penalty=agent_params["frequency_penalty"],
            top_p=agent_params["top_p"],
            max_tokens=agent_params["max_tokens"],
        ):
            if chunk.get("type") == "content_delta":
                delta = chunk.get("delta", "")
                turn_content += delta
                full_content += delta
                yield {"type": "content_delta", "delta": delta}
            elif chunk.get("type") == "tool_call":
                idx = chunk.get("index", 0)
                key = f"idx_{idx}"
                tc_id = chunk.get("id", "")
                name = chunk.get("name", "")
                args_chunk = chunk.get("arguments", "")
                if key not in tool_calls_by_id:
                    tool_calls_by_id[key] = {"id": tc_id or key, "name": name, "arguments": ""}
                tool_calls_by_id[key]["arguments"] += args_chunk
                if name:
                    tool_calls_by_id[key]["name"] = name
                if tc_id and tc_id.startswith("call_"):
                    tool_calls_by_id[key]["id"] = tc_id

        # Fallback: model sometimes outputs tool call as JSON in text
        if not tool_calls_by_id and turn_content.strip():
            parsed = executor._try_parse_text_tool_call(turn_content)
            if parsed:
                tool_calls_by_id["fallback"] = {
                    "id": parsed.get("call_id", "fallback_search_notes"),
                    "name": parsed["name"],
                    "arguments": parsed["arguments"],
                }
                logger.warning("chat: detected tool call in text", extra={"name": parsed["name"]})

        executed_any = False
        assistant_tool_calls = []
        tool_results: list[dict[str, Any]] = []

        for tc_key, tc in tool_calls_by_id.items():
            tc_id = tc.get("id", tc_key)
            name = tc.get("name")
            args_str = tc.get("arguments", "") or "{}"
            if name not in TOOLS:
                continue

            try:
                args = json.loads(args_str) if args_str.strip() else {}
            except json.JSONDecodeError as e:
                logger.warning("chat: tool args JSON parse failed", extra={"args_preview": str(args_str)[:200], "error": str(e)})
                continue

            logger.info("chat: tool_call", extra={"name": name, "tool_call_id": tc_id})
            yield {"type": "tool_call", "id": tc_id, "name": name, "arguments": args}

            extra: dict[str, Any] = {"user_id": user_id, "db": db}
            if name == "search_notes":
                raw_exact = args.get("exact_queries")
                raw_semantic = args.get("semantic_queries")
                exact = _normalize_queries(raw_exact)
                semantic = _normalize_queries(raw_semantic)
                if not (exact or semantic):
                    extra["fallback_query"] = user_content

            result = await executor._execute_tool(
                tool_name=name,
                raw_args=args_str,
                tool_call_id=tc_id,
                extra_context=extra,
            )

            if name == "search_notes":
                try:
                    results = json.loads(result) if isinstance(result, str) and result.strip().startswith("[") else []
                except json.JSONDecodeError:
                    results = []
                if not isinstance(results, list):
                    results = []
                logger.info("chat: tool_result", extra={"results_count": len(results), "note_ids": [r.get("id") for r in results]})
                yield {"type": "tool_result", "id": tc_id, "results": results}
            else:
                yield {"type": "tool_result", "id": tc_id, "content": result}

            executed_any = True
            assistant_tool_calls.append({
                "id": tc_id,
                "type": "function",
                "function": {"name": name, "arguments": args_str},
            })
            tool_results.append({"tool_call_id": tc_id, "content": result})

        if executed_any:
            logger.info("chat: tool executed, continuing loop")
            messages.append({"role": "assistant", "content": turn_content, "tool_calls": assistant_tool_calls})
            for tr in tool_results:
                messages.append({"role": "tool", "tool_call_id": tr["tool_call_id"], "content": tr["content"]})
        else:
            tool_calls_saved = [{"name": t.get("name"), "arguments": t.get("arguments", "")} for t in tool_calls_by_id.values()]
            break

    yield {"type": "_internal_final", "content": full_content, "tool_calls_saved": tool_calls_saved}


def _normalize_queries(raw: Any) -> list[str]:
    """Normalize model output to flat list of query strings."""
    import re

    result: list[str] = []
    if raw is None:
        return result
    items = raw if isinstance(raw, list) else [raw]
    for x in items:
        s = str(x).strip() if x is not None else ""
        if not s:
            continue
        for p in re.split(r"[,;\n]+", s):
            q = p.strip()
            if q:
                result.append(q)
    return result


class ChatExecutor(BaseChatExecutor):
    """Chat executor with search_notes tool."""

    _executor_name = "ChatExecutor"

    def __init__(self, max_tool_output_chars: int = 8000):
        super().__init__(tools=TOOLS, max_tool_output_chars=max_tool_output_chars)

    async def execute_turn(
        self,
        messages: list[dict[str, Any]],
        agent_params: dict[str, Any],
        user_id: int,
        user_content: str,
        db: Any,
        max_iterations: int = 10,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Stream one turn. Yields content_delta, tool_call, tool_result, _internal_final."""
        async for event in _stream_turn(
            self, messages, agent_params, user_id, user_content, db, max_iterations
        ):
            yield event
