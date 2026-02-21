import json
import logging
from dataclasses import dataclass, asdict
from typing import Any

import redis.asyncio as redis

from app.config import settings

logger = logging.getLogger(__name__)

PENDING_ACTION_TTL = 300  # 5 minutes


@dataclass
class PendingAction:
    tool: str
    params: dict[str, Any]
    awaiting: str  # what clarification is expected
    context: dict[str, Any]  # original user input, intermediate results


class PendingActionsStore:
    def __init__(self) -> None:
        self._client: redis.Redis | None = None

    async def _get_client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.from_url(settings.redis_url, decode_responses=True)
        return self._client

    def _key(self, user_id: int, session_id: str) -> str:
        return f"pending_action:{user_id}:{session_id}"

    async def set(
        self,
        user_id: int,
        session_id: str,
        action: PendingAction,
        ttl: int = PENDING_ACTION_TTL,
    ) -> None:
        client = await self._get_client()
        key = self._key(user_id, session_id)
        value = json.dumps(asdict(action))
        await client.setex(key, ttl, value)
        logger.debug("Stored pending action", extra={"key": key, "tool": action.tool})

    async def get(self, user_id: int, session_id: str) -> PendingAction | None:
        client = await self._get_client()
        key = self._key(user_id, session_id)
        value = await client.get(key)
        if value is None:
            return None
        try:
            data = json.loads(value)
            return PendingAction(**data)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("Failed to decode pending action", extra={"key": key, "error": str(e)})
            return None

    async def delete(self, user_id: int, session_id: str) -> None:
        client = await self._get_client()
        key = self._key(user_id, session_id)
        await client.delete(key)
        logger.debug("Deleted pending action", extra={"key": key})

    async def update_context(
        self,
        user_id: int,
        session_id: str,
        new_context: dict[str, Any],
    ) -> None:
        action = await self.get(user_id, session_id)
        if action:
            action.context.update(new_context)
            await self.set(user_id, session_id, action)


pending_actions = PendingActionsStore()
