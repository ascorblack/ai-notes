"""Tool definitions with Pydantic params and OpenAI schema."""

import json
import logging
import re
from typing import Any

from pydantic import BaseModel

from app.agent.tools.base_tool import BaseTool
from app.services import search

logger = logging.getLogger(__name__)


class SearchNotesParams(BaseModel):
    """Parameters for search_notes tool."""

    exact_queries: list[str]
    semantic_queries: list[str]


def _normalize_queries(raw: Any) -> list[str]:
    """Normalize model output to flat list of query strings."""
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


class SearchNotesTool(BaseTool):
    """Search user notes. Returns formatted results with id, title, snippet."""

    async def call(
        self,
        *,
        user_id: int,
        exact_queries: list[str],
        semantic_queries: list[str],
        fallback_query: str | None = None,
        **kwargs: object,
    ) -> str:
        if not exact_queries and not semantic_queries and fallback_query and fallback_query.strip():
            exact_queries = _normalize_queries([fallback_query.strip()])
            logger.info("search_notes: using fallback_query", extra={"fallback": fallback_query[:80]})
        logger.info(
            "search_notes: start",
            extra={"user_id": user_id, "exact_queries": exact_queries, "semantic_queries": semantic_queries},
        )

        seen: dict[int, dict[str, Any]] = {}
        rrf_k = 60

        def add(rank: int, r: dict) -> None:
            nid = r["note_id"]
            score = 1.0 / (rrf_k + rank + 1)
            if nid not in seen:
                seen[nid] = {"note_id": nid, "title": r.get("title", ""), "snippet": r.get("snippet", ""), "score": 0.0}
            seen[nid]["score"] += score
            if r.get("title") and not seen[nid]["title"]:
                seen[nid]["title"] = r["title"]
            if r.get("snippet") and not seen[nid]["snippet"]:
                seen[nid]["snippet"] = r["snippet"]

        if exact_queries:
            try:
                results = search.search_notes_union(user_id, exact_queries, limit=10)
                for rank, r in enumerate(results):
                    add(rank, r)
            except Exception as e:
                logger.warning("Search exact_union failed", extra={"queries": exact_queries[:5], "error": str(e)})
        if semantic_queries:
            try:
                results = search.search_notes_union(user_id, semantic_queries, limit=10)
                for rank, r in enumerate(results):
                    add(rank + (len(exact_queries or []) * 10), r)
            except Exception as e:
                logger.warning("Search semantic_union failed", extra={"queries": semantic_queries[:5], "error": str(e)})

        sorted_res = sorted(seen.values(), key=lambda x: -x["score"])[:15]
        logger.info(
            "search_notes: merged",
            extra={"total_unique": len(seen), "returned": len(sorted_res)},
        )
        out = [{"id": r["note_id"], "title": r["title"], "snippet": r["snippet"]} for r in sorted_res]
        return json.dumps(out, ensure_ascii=False)


class ToolDefinition:
    """Tool metadata: OpenAI schema, validation, execution."""

    def __init__(
        self,
        tool_id: str,
        description: str,
        parameters_model: type[BaseModel],
        instance: BaseTool,
        timeout_seconds: int = 60,
    ):
        self.tool_id = tool_id
        self.description = description
        self.parameters_model = parameters_model
        self.instance = instance
        self.timeout_seconds = timeout_seconds

    def to_openai_function(self) -> dict:
        schema = self.parameters_model.model_json_schema()
        return {
            "type": "function",
            "function": {
                "name": self.tool_id,
                "description": self.description,
                "parameters": schema,
            },
        }

    def validate_args(self, args: dict) -> BaseModel:
        return self.parameters_model.model_validate(args)


SEARCH_NOTES_TOOL_DEF = ToolDefinition(
    tool_id="search_notes",
    description="Поиск по заметкам пользователя. Обязательно включи в exact_queries точные термины из запроса (ключевые слова, аббревиатуры, имена). Добавь варианты написания (langpt, LangPT, LanGPT). semantic_queries — переформулировки и синонимы. Каждый список — массив строк.",
    parameters_model=SearchNotesParams,
    instance=SearchNotesTool(),
    timeout_seconds=30,
)
