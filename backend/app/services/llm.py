import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _agent_params(
    *,
    base_url: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    temperature: float | None = None,
    frequency_penalty: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    """Build LLM request params from overrides or config defaults."""
    return {
        "base_url": base_url or settings.vllm_base_url,
        "model": model or settings.vllm_model,
        "api_key": api_key if api_key is not None else settings.vllm_api_key,
        "temperature": temperature if temperature is not None else settings.vllm_temperature,
        "frequency_penalty": frequency_penalty if frequency_penalty is not None else settings.vllm_frequency_penalty,
        "top_p": top_p if top_p is not None else settings.vllm_top_p,
        "max_tokens": max_tokens if max_tokens is not None else settings.vllm_max_tokens,
    }


async def chat_completion(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    *,
    base_url: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    temperature: float | None = None,
    frequency_penalty: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    params = _agent_params(
        base_url=base_url,
        model=model,
        api_key=api_key,
        temperature=temperature,
        frequency_penalty=frequency_penalty,
        top_p=top_p,
        max_tokens=max_tokens,
    )
    payload: dict[str, Any] = {
        "model": params["model"],
        "messages": messages,
        "max_tokens": params["max_tokens"],
        "temperature": params["temperature"],
        "frequency_penalty": params["frequency_penalty"],
        "top_p": params["top_p"],
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if params["api_key"]:
        headers["Authorization"] = f"Bearer {params['api_key']}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{params['base_url'].rstrip('/')}/chat/completions",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
        choice = data.get("choices")
        if not choice:
            raise ValueError("No choices in vLLM response")
        return choice[0]


async def chat_completion_stream(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    *,
    base_url: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    temperature: float | None = None,
    frequency_penalty: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream chat completion. Yields delta chunks and tool_calls when complete."""
    params = _agent_params(
        base_url=base_url,
        model=model,
        api_key=api_key,
        temperature=temperature,
        frequency_penalty=frequency_penalty,
        top_p=top_p,
        max_tokens=max_tokens,
    )
    payload: dict[str, Any] = {
        "model": params["model"],
        "messages": messages,
        "max_tokens": params["max_tokens"],
        "temperature": params["temperature"],
        "frequency_penalty": params["frequency_penalty"],
        "top_p": params["top_p"],
        "stream": True,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if params["api_key"]:
        headers["Authorization"] = f"Bearer {params['api_key']}"

    url = f"{params['base_url'].rstrip('/')}/chat/completions"
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            buffer = ""
            async for chunk in resp.aiter_bytes():
                buffer += chunk.decode("utf-8", errors="replace")
                while "\n" in buffer or "\r\n" in buffer:
                    line, _, buffer = buffer.partition("\n")
                    line = line.rstrip("\r")
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        return
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    choices = data.get("choices", [])
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    content = delta.get("content")
                    if content:
                        yield {"type": "content_delta", "delta": content}
                    tool_calls = delta.get("tool_calls")
                    if tool_calls:
                        for tc in tool_calls:
                            if isinstance(tc, dict):
                                fn = tc.get("function", {}) or {}
                                name = fn.get("name") or ""
                                args_chunk = fn.get("arguments") or ""
                                if name or args_chunk:
                                    yield {
                                        "type": "tool_call",
                                        "index": tc.get("index", 0),
                                        "id": tc.get("id", ""),
                                        "name": name,
                                        "arguments": args_chunk,
                                    }
