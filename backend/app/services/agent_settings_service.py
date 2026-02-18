"""Get/update agent settings from DB. Uses config defaults when not set."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import AgentSettings


def _defaults_for_agent(agent_type: str) -> dict:
    if agent_type == "notes":
        return {
            "base_url": settings.vllm_base_url,
            "model": settings.vllm_model,
            "api_key": settings.vllm_api_key or "",
        }
    return {
        "base_url": settings.vllm_chat_base_url,
        "model": settings.vllm_chat_model,
        "api_key": settings.vllm_chat_api_key or "",
    }


async def get_agent_settings(
    db: AsyncSession, user_id: int, agent_type: str
) -> dict[str, float | int | str]:
    """Return settings for user+agent_type. Uses config defaults when not in DB."""
    defaults = _defaults_for_agent(agent_type)
    result = await db.execute(
        select(AgentSettings)
        .where(AgentSettings.user_id == user_id, AgentSettings.agent_type == agent_type)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return {
            "base_url": defaults["base_url"],
            "model": defaults["model"],
            "api_key": defaults["api_key"],
            "temperature": settings.vllm_temperature,
            "frequency_penalty": settings.vllm_frequency_penalty,
            "top_p": settings.vllm_top_p,
            "max_tokens": settings.vllm_max_tokens,
        }
    return {
        "base_url": row.base_url if row.base_url is not None else defaults["base_url"],
        "model": row.model if row.model is not None else defaults["model"],
        "api_key": row.api_key if row.api_key is not None else defaults["api_key"],
        "temperature": row.temperature,
        "frequency_penalty": row.frequency_penalty,
        "top_p": row.top_p,
        "max_tokens": row.max_tokens,
    }


async def get_agent_settings_for_api(
    db: AsyncSession, user_id: int, agent_type: str
) -> dict:
    """Return settings for API response (no api_key value, only api_key_set)."""
    s = await get_agent_settings(db, user_id, agent_type)
    row_result = await db.execute(
        select(AgentSettings)
        .where(AgentSettings.user_id == user_id, AgentSettings.agent_type == agent_type)
    )
    row = row_result.scalar_one_or_none()
    api_key_set = row is not None and row.api_key is not None and len(row.api_key) > 0
    return {
        "base_url": s["base_url"],
        "model": s["model"],
        "api_key_set": api_key_set,
        "temperature": s["temperature"],
        "frequency_penalty": s["frequency_penalty"],
        "top_p": s["top_p"],
        "max_tokens": s["max_tokens"],
    }


async def upsert_agent_settings(
    db: AsyncSession,
    user_id: int,
    agent_type: str,
    *,
    base_url: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    temperature: float | None = None,
    frequency_penalty: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> AgentSettings:
    """Create or update settings. Returns the row."""
    defaults = _defaults_for_agent(agent_type)
    result = await db.execute(
        select(AgentSettings)
        .where(AgentSettings.user_id == user_id, AgentSettings.agent_type == agent_type)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = AgentSettings(
            user_id=user_id,
            agent_type=agent_type,
            base_url=base_url,
            model=model,
            api_key=api_key,
            temperature=temperature if temperature is not None else settings.vllm_temperature,
            frequency_penalty=(
                frequency_penalty if frequency_penalty is not None else settings.vllm_frequency_penalty
            ),
            top_p=top_p if top_p is not None else settings.vllm_top_p,
            max_tokens=max_tokens if max_tokens is not None else settings.vllm_max_tokens,
        )
        db.add(row)
    else:
        if base_url is not None:
            row.base_url = base_url if base_url != "" else None
        if model is not None:
            row.model = model if model != "" else None
        if api_key is not None:
            row.api_key = api_key if api_key != "" else None
        if temperature is not None:
            row.temperature = temperature
        if frequency_penalty is not None:
            row.frequency_penalty = frequency_penalty
        if top_p is not None:
            row.top_p = top_p
        if max_tokens is not None:
            row.max_tokens = max_tokens
    await db.flush()
    await db.refresh(row)
    return row
