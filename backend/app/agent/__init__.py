"""Agent package — executors for chat, notes, task, event."""

from app.agent.base_executor import BaseChatExecutor, build_system_prompt
from app.agent.chat_executor import ChatExecutor
from app.agent.dispatcher import AgentDispatcher, UnknownIntentError
from app.agent.event_executor import EventExecutor
from app.agent.intent_classifier import IntentClassifier, IntentCategory
from app.agent.notes_executor import NotesExecutor
from app.agent.task_executor import TaskExecutor
from app.agent.tools.tool_def import SEARCH_NOTES_TOOL_DEF, SearchNotesParams

__all__ = [
    "BaseChatExecutor",
    "build_system_prompt",
    "ChatExecutor",
    "EventExecutor",
    "IntentCategory",
    "IntentClassifier",
    "NotesExecutor",
    "SEARCH_NOTES_TOOL_DEF",
    "SearchNotesParams",
    "TaskExecutor",
    "AgentDispatcher",
    "UnknownIntentError",
]
