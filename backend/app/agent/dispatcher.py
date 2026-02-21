"""Agent dispatcher: routes requests to NotesExecutor, TaskExecutor, or EventExecutor by intent."""

import logging
from typing import Any

from app.agent.event_executor import EventExecutor
from app.agent.intent_classifier import IntentCategory
from app.agent.notes_executor import NotesExecutor
from app.agent.task_executor import TaskExecutor

logger = logging.getLogger(__name__)


class UnknownIntentError(ValueError):
    """Raised when intent is UNKNOWN."""

    pass


class AgentDispatcher:
    """Dispatches to specialized executors by intent. Used only for main page (/agent/process)."""

    def __init__(
        self,
        notes_executor: NotesExecutor | None = None,
        task_executor: TaskExecutor | None = None,
        event_executor: EventExecutor | None = None,
    ):
        self.notes = notes_executor or NotesExecutor()
        self.task = task_executor or TaskExecutor()
        self.event = event_executor or EventExecutor()

    async def process(
        self,
        intent: IntentCategory,
        db: Any,
        user_id: int,
        user_input: str,
        *,
        note_id: int | None = None,
        agent_params: dict[str, Any] | None = None,
        on_event: Any = None,
    ) -> tuple[list[int], list[int], str | None]:
        """Dispatch to executor and return (affected_ids, created_ids, skipped_reason)."""
        if intent == IntentCategory.UNKNOWN:
            raise UnknownIntentError("Не понял запрос. Попробуйте переформулировать.")

        # When user has a note/task selected, always use NotesExecutor — it supports append/patch.
        # TaskExecutor only has create_task and would create a duplicate instead of editing.
        if note_id is not None:
            return await self.notes.execute_turn(
                db=db,
                user_id=user_id,
                user_input=user_input,
                note_id=note_id,
                agent_params=agent_params,
                on_event=on_event,
            )

        if intent == IntentCategory.NOTE:
            return await self.notes.execute_turn(
                db=db,
                user_id=user_id,
                user_input=user_input,
                note_id=note_id,
                agent_params=agent_params,
                on_event=on_event,
            )
        if intent == IntentCategory.TASK:
            return await self.task.execute_turn(
                db=db,
                user_id=user_id,
                user_input=user_input,
                note_id=note_id,
                agent_params=agent_params,
                on_event=on_event,
            )
        if intent == IntentCategory.EVENT:
            return await self.event.execute_turn(
                db=db,
                user_id=user_id,
                user_input=user_input,
                note_id=note_id,
                agent_params=agent_params,
                on_event=on_event,
            )

        raise UnknownIntentError("Не понял запрос. Попробуйте переформулировать.")
