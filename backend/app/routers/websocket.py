"""WebSocket endpoint for real-time agent interaction."""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.services.auth import decode_token
from app.services.pending_actions import pending_actions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.debug("User connected to WS", extra={"user_id": user_id})

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.debug("User disconnected from WS", extra={"user_id": user_id})

    async def send(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append(connection)
            for conn in disconnected:
                self.disconnect(user_id, conn)

    async def broadcast(self, message: dict):
        for user_id in self.active_connections:
            await self.send(user_id, message)


manager = ConnectionManager()


async def handle_agent_message(
    message: dict,
    user_id: int,
    session_id: str | None,
    db: AsyncSession,
):
    """Process agent input via WebSocket."""
    from app.agent.dispatcher import AgentDispatcher
    from app.agent.intent_classifier import IntentClassifier
    from app.agent.tools.request_clarification import ClarificationNeeded

    action = message.get("action")
    if action == "resume":
        pending = await pending_actions.get(user_id, session_id)
        if not pending:
            return {"error": "No pending action found", "session_id": session_id}

        intent = pending.context.get("intent")
        if not intent:
            return {"error": "Invalid pending action", "session_id": session_id}

        user_input = message.get("input", "")
        from app.services.agent_settings_service import get_agent_settings_for_api
        settings = await get_agent_settings_for_api(db, user_id, "notes")

        try:
            affected, created, _ = await AgentDispatcher().process(
                intent=IntentClassifier.INTENT_LABEL_MAP.get(intent, IntentClassifier.IntentCategory.NOTE),
                db=db,
                user_id=user_id,
                user_input=user_input,
                note_id=None,
                agent_params=settings,
            )
            await pending_actions.delete(user_id, session_id)
            return {
                "status": "completed",
                "session_id": session_id,
                "affected_ids": affected,
                "created_ids": created,
            }
        except ClarificationNeeded as e:
            return {
                "status": "clarification_needed",
                "session_id": session_id,
                "question": e.question,
            }
        except Exception as e:
            logger.error("WS agent resume failed", exc_info=True, extra={"user_id": user_id})
            return {"error": str(e), "session_id": session_id}
    else:
        return {"error": "Unknown action", "session_id": session_id}


@router.websocket("/agent")
async def websocket_agent(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return
    try:
        token_data = decode_token(token)
        user_id = token_data.user_id
    except Exception:
        await websocket.close(code=4001)
        return

    from sqlalchemy import select
    from app.models import User

    db = async_session_maker()
    try:
        async with db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
    finally:
        await asyncio.shield(db.close())
    if not user:
        await websocket.close(code=4001)
        return

    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})
                continue

            session_id = msg.get("session_id")
            db = async_session_maker()
            try:
                async with db:
                    result = await handle_agent_message(msg, user_id, session_id, db)
                await websocket.send_json(result)
            finally:
                await asyncio.shield(db.close())
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user_id, websocket)
